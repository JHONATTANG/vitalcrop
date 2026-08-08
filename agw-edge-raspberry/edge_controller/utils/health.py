"""
AGW Edge Gateway — Health Check HTTP Server
FastAPI mini-app con endpoints de diagnóstico
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse

log = structlog.get_logger()

_START_TIME = time.monotonic()


def _uptime_seconds() -> int:
    return int(time.monotonic() - _START_TIME)


class HealthServer:
    """
    Servidor FastAPI de health check con endpoints:
      GET /health       → liveness básico
      GET /health/ready → readiness (MQTT conectado, DB OK)
      GET /health/info  → info detallada (buffer stats, nodos)
    """

    def __init__(self, config, mqtt_client=None, local_db=None):
        self.config = config
        self.mqtt_client = mqtt_client
        self.local_db = local_db
        self._app = self._build_app()

    def _build_app(self) -> FastAPI:
        app = FastAPI(
            title="AGW Edge Health",
            description="VitalCrop Edge Gateway health check endpoint",
            version="1.0.0",
            docs_url="/health/docs",
        )

        @app.get("/health", tags=["health"])
        async def liveness():
            """Liveness probe — el proceso está vivo."""
            return {
                "status": "ok",
                "gateway_id": self.config.device.gateway_id,
                "uptime_seconds": _uptime_seconds(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        @app.get("/health/ready", tags=["health"])
        async def readiness():
            """Readiness probe — todos los componentes críticos están listos."""
            checks = {}
            overall_ok = True

            # MQTT connectivity
            if self.mqtt_client:
                mqtt_ok = self.mqtt_client.is_connected()
                checks["mqtt"] = "ok" if mqtt_ok else "degraded"
                if not mqtt_ok:
                    overall_ok = False
            else:
                checks["mqtt"] = "unknown"

            # DB connectivity
            if self.local_db:
                try:
                    await self.local_db.get_buffer_stats()
                    checks["database"] = "ok"
                except Exception as exc:
                    checks["database"] = f"error: {exc}"
                    overall_ok = False
            else:
                checks["database"] = "unknown"

            status_code = 200 if overall_ok else 503
            return JSONResponse(
                status_code=status_code,
                content={
                    "status": "ready" if overall_ok else "degraded",
                    "checks": checks,
                    "uptime_seconds": _uptime_seconds(),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

        @app.get("/health/info", tags=["health"])
        async def info():
            """Información detallada del estado del edge gateway."""
            result = {
                "gateway_id": self.config.device.gateway_id,
                "location": self.config.device.location,
                "firmware_version": self.config.device.firmware_version,
                "uptime_seconds": _uptime_seconds(),
                "mqtt_connected": self.mqtt_client.is_connected() if self.mqtt_client else None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Stats del buffer SQLite
            if self.local_db:
                try:
                    buffer_stats = await self.local_db.get_buffer_stats()
                    node_statuses = await self.local_db.get_all_node_statuses()
                    result["buffer"] = buffer_stats
                    result["nodes"] = [
                        {
                            "node_id": n["node_id"],
                            "device_type": n["device_type"],
                            "status": n["status"],
                            "last_seen": n["last_seen"],
                            "rssi": n["rssi"],
                        }
                        for n in node_statuses
                    ]
                except Exception as exc:
                    result["buffer"] = {"error": str(exc)}
                    result["nodes"] = []

            return result

        return app

    async def run(self) -> None:
        if not self.config.health.enabled:
            log.info("Health server disabled — skipping")
            return

        cfg = self.config.health
        log.info("Health server starting", host=cfg.host, port=cfg.port)

        server_config = uvicorn.Config(
            app=self._app,
            host=cfg.host,
            port=cfg.port,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(server_config)
        await server.serve()
