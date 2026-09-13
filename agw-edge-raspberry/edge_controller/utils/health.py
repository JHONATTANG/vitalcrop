"""
AGW Edge Gateway — Servidor HTTP: salud y webhook
==================================================
Diagnóstico (`/health*`) y el receptor de avisos de la nube
(`POST /webhook/ordenes`). Es el mismo servidor y el mismo puerto: es
el que Tailscale Funnel expone al exterior, así que todo lo que cuelga
de aquí es público y se comporta como tal: los `/health` no revelan
nada sensible, y el webhook no hace nada sin una firma válida.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import structlog
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from cloud.webhook import verificar_firma

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

    def __init__(self, config, mqtt_client=None, local_db=None, command_poller=None, ritmo=None):
        self.config = config
        self.mqtt_client = mqtt_client
        self.local_db = local_db
        self.command_poller = command_poller
        self.ritmo = ritmo
        self.stats = {"avisos_ok": 0, "avisos_rechazados": 0}
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

        @app.post("/webhook/ordenes", tags=["webhook"])
        async def aviso_de_ordenes(request: Request):
            """
            La nube avisa: hay órdenes encoladas para este gateway.

            No trae la orden; trae el motivo de salir a buscarla. Se
            responde en cuanto se verifica la firma y se despierta el
            poller: la nube tiene 4 s de tope y no hay que hacerle
            esperar la vuelta completa.
            """
            cuerpo = await request.body()
            valida, motivo = verificar_firma(
                self.config.cloud.webhook_secret,
                request.headers.get("X-AGW-Timestamp", ""),
                request.headers.get("X-AGW-Signature", ""),
                cuerpo,
            )
            if not valida:
                self.stats["avisos_rechazados"] += 1
                log.warning("Aviso rechazado", motivo=motivo,
                            origen=request.client.host if request.client else "?")
                return JSONResponse(status_code=401, content={"detail": "firma inválida"})

            self.stats["avisos_ok"] += 1
            if self.command_poller is not None:
                self.command_poller.despertar("aviso")
                log.info("Aviso de la nube recibido: hay órdenes")
                return {"status": "ok", "accion": "sondeo inmediato"}
            return {"status": "ok", "accion": "sin poller"}

        @app.post("/webhook/presencia", tags=["webhook"])
        async def aviso_de_presencia(request: Request):
            """
            La nube avisa: hay un usuario con sesión mirando sus nodos.

            Trae `segundos`: cuánto mantener el modo despierto. El panel
            manda latidos mientras el usuario esté; cada uno prorroga.
            Sin latidos, el vencimiento pasa y el gateway vuelve a
            dormir solo.
            """
            cuerpo = await request.body()
            valida, motivo = verificar_firma(
                self.config.cloud.webhook_secret,
                request.headers.get("X-AGW-Timestamp", ""),
                request.headers.get("X-AGW-Signature", ""),
                cuerpo,
            )
            if not valida:
                self.stats["avisos_rechazados"] += 1
                log.warning("Presencia rechazada", motivo=motivo)
                return JSONResponse(status_code=401, content={"detail": "firma inválida"})
            if self.ritmo is None:
                return {"status": "ok", "accion": "sin ritmo"}
            try:
                segundos = int((json.loads(cuerpo or b"{}") or {}).get("segundos", 180))
            except (ValueError, TypeError):
                segundos = 180
            segundos = max(30, min(segundos, 900))
            desperto = self.ritmo.marcar_presencia(segundos)
            return {"status": "ok", **self.ritmo.describir(), "desperto": desperto}

        @app.get("/health/ritmo", tags=["health"])
        async def ritmo():
            """En qué modo está el gateway y cuánto le queda de presencia."""
            return self.ritmo.describir() if self.ritmo is not None else {"modo": "sin ritmo"}

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
