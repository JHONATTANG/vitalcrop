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
