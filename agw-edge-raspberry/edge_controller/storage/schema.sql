-- AGW Edge Gateway — SQLite Buffer Schema
-- Persistencia offline de telemetría y alertas locales

PRAGMA journal_mode=WAL;    -- Write-Ahead Logging para mejor concurrencia
PRAGMA synchronous=NORMAL;   -- Balance entre durabilidad y rendimiento

-- ── Buffer offline de telemetría ──────────────────────────────

CREATE TABLE IF NOT EXISTS telemetry_buffer (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id      TEXT    NOT NULL,
    device_type  TEXT    NOT NULL,
    payload      TEXT    NOT NULL,      -- JSON serializado completo
    timestamp    INTEGER NOT NULL,      -- Unix timestamp del dato
    synced       INTEGER DEFAULT 0,     -- 0=pendiente, 1=sincronizado
    created_at   INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_buffer_synced_created
    ON telemetry_buffer (synced, created_at);

CREATE INDEX IF NOT EXISTS idx_buffer_node
    ON telemetry_buffer (node_id, created_at DESC);

-- ── Log de alertas locales ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS local_alerts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id      TEXT,
    node_id      TEXT,
    alert_type   TEXT,
    severity     TEXT,
    message      TEXT,
    sensor_data  TEXT,                  -- JSON con el valor que disparó la regla
    created_at   INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_created
    ON local_alerts (created_at DESC);

-- ── Estado/heartbeat de nodos ─────────────────────────────────

CREATE TABLE IF NOT EXISTS node_status (
    node_id      TEXT    PRIMARY KEY,
    device_type  TEXT,
    status       TEXT,                  -- online / offline / error
    firmware_ver TEXT,
    ip_address   TEXT,
    rssi         INTEGER,               -- WiFi signal strength
    last_seen    INTEGER DEFAULT (strftime('%s', 'now')),
    payload      TEXT                   -- Último status JSON completo
);

-- ── Eventos del nodo ──────────────────────────────────────────
--
--  node_status guarda SOLO el último estado, una fila por nodo. Sirve
--  para saber como esta ahora, y para nada mas: cuando el nodo se cayo
--  el 23 de agosto no quedo rastro de la caida en ningun sitio salvo el
--  journal de systemd, que rota y se pierde.
--
--  Aqui queda la historia de lo que PASA: conexiones, caidas, y las
--  discrepancias entre el programa que ejecuta el nodo y el que deberia
--  ejecutar. Sin esto, un gateway reenviando valores viejos durante
--  cinco dias no deja ni una linea.

CREATE TABLE IF NOT EXISTS node_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id    TEXT    NOT NULL,
    evento     TEXT    NOT NULL,   -- conectado | desconectado | discrepancia
                                   -- | corregido | riego_tierra
    detalle    TEXT,               -- JSON con lo especifico del evento
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_created
    ON node_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_tipo
    ON node_events (evento, created_at DESC);

-- ── Historico del nodo ────────────────────────────────────────
--
--  Serie temporal local, independiente de la nube. El buffer de
--  telemetria se borra al sincronizar y se poda al llegar al limite, asi
--  que no sirve como archivo: esta pensado para transportar, no para
--  guardar. Esta tabla si es el archivo, y vive en la Pi aunque la nube
--  no exista.
--
--  Se guardan columnas y no un JSON entero para poder consultarlo con
--  SQL corriente: "cuantas horas rego ayer", "que EC tenia el martes".

CREATE TABLE IF NOT EXISTS node_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id      TEXT    NOT NULL,
    ts           INTEGER NOT NULL,     -- epoch local de la Pi
    online       INTEGER,              -- 1 respondio, 0 no
    uptime_s     INTEGER,
    rssi         INTEGER,
    heap         INTEGER,
    es_dia       INTEGER,
    hora_valida  INTEGER,
    luz          INTEGER,              -- estado del rele de ambiente
    bomba        INTEGER,
    valv_hidro   INTEGER,
    valv_tierra  INTEGER,
    riego_hidro  INTEGER,              -- ciclo de hidroponia en curso
    temp         REAL,
    hum          REAL,
    ec           REAL,
    tds          REAL,
    nivel_raw    INTEGER,
    agua         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_history_ts
    ON node_history (ts DESC);

CREATE INDEX IF NOT EXISTS idx_history_node_ts
    ON node_history (node_id, ts DESC);
