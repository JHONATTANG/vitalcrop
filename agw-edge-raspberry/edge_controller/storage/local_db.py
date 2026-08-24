"""
AGW Edge Gateway — Local SQLite Database
aiosqlite wrapper para persistencia offline de telemetría y alertas
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import aiosqlite
import structlog

log = structlog.get_logger()

_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class LocalDB:
    """
    Capa de acceso a datos SQLite async con aiosqlite.
    Provee:
    - Persistencia de telemetría con flag de sincronización
    - Consulta de registros no sincronizados (para offline recovery)
    - Almacenamiento de alertas locales
    - Heartbeat de estado de nodos
    """

    def __init__(self, config):
        self.config = config
        self._db_path = config.storage.db_path
        self._max_records = config.storage.max_buffered_records
        self._db: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """Inicializa la DB y aplica el schema."""
        # Crear directorio si no existe
        db_dir = Path(self._db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)

        self._db = await aiosqlite.connect(self._db_path)
        self._db.row_factory = aiosqlite.Row

        # Aplicar schema
        schema = _SCHEMA_PATH.read_text()
        await self._db.executescript(schema)
        await self._db.commit()

        log.info("LocalDB initialized", path=self._db_path)

        # Limpiar registros antiguos si se supera el límite
        await self._enforce_buffer_limit()

    # ─────────────────────────────────────────────────────────────
    # Telemetría
    # ─────────────────────────────────────────────────────────────

    async def save_telemetry(self, data: dict, device_type: str | None = None) -> int:
        """Guarda un registro de telemetría en el buffer. Retorna el row ID."""
        node_id = data.get("node_id", "unknown")
        device_type = device_type or data.get("device_type", "UNKNOWN")
        timestamp = data.get("timestamp", int(time.time()))

        async with self._db.execute(
            """
            INSERT INTO telemetry_buffer (node_id, device_type, payload, timestamp)
            VALUES (?, ?, ?, ?)
            """,
            (node_id, device_type.upper(), json.dumps(data), timestamp),
        ) as cursor:
            row_id = cursor.lastrowid

        await self._db.commit()
        await self._enforce_buffer_limit()
        return row_id

    async def get_unsynced_telemetry(self, limit: int = 50) -> list[dict]:
        """Retorna registros no sincronizados ordenados por antigüedad."""
        async with self._db.execute(
            """
            SELECT id, node_id, device_type, payload, timestamp
            FROM telemetry_buffer
            WHERE synced = 0
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (limit,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def mark_synced(self, ids: list[int]) -> None:
        """Marca registros como sincronizados."""
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        await self._db.execute(
            f"UPDATE telemetry_buffer SET synced = 1 WHERE id IN ({placeholders})",
            ids,
        )
        await self._db.commit()

    # ─────────────────────────────────────────────────────────────
    # Alertas
    # ─────────────────────────────────────────────────────────────

    async def save_alert(self, alert: dict) -> None:
        """Persiste una alerta local generada por el rules engine."""
        await self._db.execute(
            """
            INSERT INTO local_alerts
                (rule_id, node_id, alert_type, severity, message, sensor_data)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                alert.get("rule_id"),
                alert.get("node_id"),
                alert.get("alert_type"),
                alert.get("severity"),
                alert.get("message"),
                json.dumps(alert.get("sensor_data", {})),
            ),
        )
        await self._db.commit()

    # ─────────────────────────────────────────────────────────────
    # Node status
    # ─────────────────────────────────────────────────────────────

    async def save_node_status(self, data: dict) -> None:
        """Upsert del estado de un nodo (heartbeat)."""
        node_id = data.get("node_id")
        if not node_id:
            return

        await self._db.execute(
            """
            INSERT INTO node_status
                (node_id, device_type, status, firmware_ver, ip_address, rssi, last_seen, payload)
            VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
            ON CONFLICT(node_id) DO UPDATE SET
                status       = excluded.status,
                firmware_ver = excluded.firmware_ver,
                ip_address   = excluded.ip_address,
                rssi         = excluded.rssi,
                last_seen    = excluded.last_seen,
                payload      = excluded.payload
            """,
            (
                node_id,
                data.get("device_type", "UNKNOWN"),
                data.get("status", "unknown"),
                data.get("firmware_version"),
                data.get("ip_address"),
                data.get("rssi"),
                json.dumps(data),
            ),
        )
        await self._db.commit()

    async def get_ultimo_riego_tierra(self) -> "datetime | None":
        """
        Fecha del último riego de tierra registrado.

        El gateway lleva el calendario de los 15 días; el nodo tiene
        además su propio contador por si nunca recibe la fecha. Si no hay
        historial se devuelve None y NodeSync programa el primero para el
        día siguiente: arrancar regando nada más encender el sistema
        sería una sorpresa desagradable.
        """
        from datetime import datetime

        async with self._db.execute(
            """
            SELECT MAX(created_at) AS ts
            FROM local_alerts
            WHERE alert_type = 'RIEGO_TIERRA'
            """
        ) as cursor:
            row = await cursor.fetchone()

        ts = row["ts"] if row else None
        return datetime.fromtimestamp(ts) if ts else None

    async def registrar_riego_tierra(self, node_id: str, detalle: dict) -> None:
        """Deja constancia de un riego de tierra para el cálculo del próximo."""
        await self.save_alert(
            {
                "rule_id": "riego_tierra",
                "node_id": node_id,
                "alert_type": "RIEGO_TIERRA",
                "severity": "INFO",
                "message": "Riego de tierra ejecutado",
                "sensor_data": detalle,
            }
        )

    async def get_all_node_statuses(self) -> list[dict]:
        """Retorna todos los nodos registrados con su último estado."""
        async with self._db.execute(
            "SELECT * FROM node_status ORDER BY last_seen DESC"
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    # ─────────────────────────────────────────────────────────────
    # Eventos e historico del nodo
    # ─────────────────────────────────────────────────────────────

    async def registrar_evento(self, node_id: str, evento: str,
                               detalle: dict | None = None) -> None:
        """
        Deja constancia de algo que pasó: una caída, una reconexión, una
        discrepancia entre lo que el nodo ejecuta y lo que debería.

        Se guarda aquí y no solo en el log porque el journal de systemd
        rota: cuando quieras saber cuántas veces se cayó el nodo el mes
        pasado, el log ya no lo sabe y esta tabla sí.
        """
        await self._db.execute(
            "INSERT INTO node_events (node_id, evento, detalle) VALUES (?, ?, ?)",
            (node_id, evento, json.dumps(detalle or {}, default=str)),
        )
        await self._db.commit()

    async def guardar_snapshot(self, node_id: str, e: dict) -> None:
        """
        Una fila del histórico a partir de un /estado del nodo.

        Recibe el JSON tal cual lo entrega el nodo y se queda con lo que
        vale la pena en el tiempo. Si el nodo no respondió, se llama con
        `{}` y queda la fila con online=0: los huecos también son dato.
        """
        ts = int(time.time())

        if not e:
            await self._db.execute(
                "INSERT INTO node_history (node_id, ts, online) VALUES (?, ?, 0)",
                (node_id, ts),
            )
            await self._db.commit()
            return

        sal = e.get("salidas") or []
        def rele(i: int) -> int | None:
            return int(bool(sal[i]["estado"])) if len(sal) > i else None

        s  = e.get("sensores") or {}
        ej = e.get("ejecutando") or {}

        await self._db.execute(
            """
            INSERT INTO node_history (
                node_id, ts, online, uptime_s, rssi, heap, es_dia, hora_valida,
                luz, bomba, valv_hidro, valv_tierra, riego_hidro,
                temp, hum, ec, tds, nivel_raw, agua
            ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                node_id, ts,
                (e.get("uptime_ms") or 0) // 1000,
                e.get("rssi"), e.get("heap"),
                int(bool(e.get("es_dia"))), int(bool(e.get("hora_valida"))),
                rele(3), rele(2), rele(0), rele(1),
                int(bool(ej.get("riego_hidro"))),
                s.get("temp"), s.get("hum"), s.get("ec"), s.get("tds"),
                s.get("nivel_raw"), int(bool(s.get("agua"))),
            ),
        )
        await self._db.commit()

    async def podar_historico(self, dias: int) -> int:
        """
        Borra historial y eventos más viejos que `dias`.

        El disco de la Pi son 6.9 GB y esto crece sin freno: una fila cada
        cinco minutos son ~18 MB al año, poco, pero nada que escriba sin
        parar puede quedarse sin poda.
        """
        corte = int(time.time()) - dias * 86400
        cur = await self._db.execute("DELETE FROM node_history WHERE ts < ?", (corte,))
        borradas = cur.rowcount or 0
        cur = await self._db.execute(
            "DELETE FROM node_events WHERE created_at < ?", (corte,)
        )
        borradas += cur.rowcount or 0

        # local_alerts no se podaba NUNCA: crecia sin freno a ~45 MB al
        # ano. Se poda igual que el resto, con una excepcion: las filas
        # de RIEGO_TIERRA sostienen el calendario de llenados —de ahi
        # sale la fecha del proximo— y borrarlas reiniciaria el ciclo
        # en silencio.
        cur = await self._db.execute(
            "DELETE FROM local_alerts WHERE created_at < ? AND alert_type != 'RIEGO_TIERRA'",
            (corte,),
        )
        borradas += cur.rowcount or 0

        await self._db.commit()
        return borradas

    async def resumen_eventos(self, horas: int = 24) -> list[dict]:
        """Eventos recientes, para el endpoint de salud y para consultar."""
        desde = int(time.time()) - horas * 3600
        async with self._db.execute(
            """
            SELECT evento, COUNT(*) AS n, MAX(created_at) AS ultimo
            FROM node_events WHERE created_at >= ?
            GROUP BY evento ORDER BY ultimo DESC
            """,
            (desde,),
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ─────────────────────────────────────────────────────────────
    # Buffer management
    # ─────────────────────────────────────────────────────────────

    async def _enforce_buffer_limit(self) -> None:
        """Elimina los registros más antiguos si se supera max_buffered_records."""
        async with self._db.execute(
            "SELECT COUNT(*) as cnt FROM telemetry_buffer WHERE synced = 0"
        ) as cursor:
            row = await cursor.fetchone()
            count = row["cnt"]

        if count > self._max_records:
            overflow = count - self._max_records
            await self._db.execute(
                """
                DELETE FROM telemetry_buffer WHERE id IN (
                    SELECT id FROM telemetry_buffer
                    WHERE synced = 0
                    ORDER BY created_at ASC
                    LIMIT ?
                )
                """,
                (overflow,),
            )
            await self._db.commit()
            log.warning(
                "Buffer overflow — oldest records purged",
                purged=overflow,
                max=self._max_records,
            )

    async def get_buffer_stats(self) -> dict:
        """Estadísticas del buffer para el health endpoint."""
        async with self._db.execute(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN synced=0 THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN synced=1 THEN 1 ELSE 0 END) as synced
            FROM telemetry_buffer
            """
        ) as cursor:
            row = await cursor.fetchone()
        return dict(row)

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            log.info("LocalDB closed")
