"""
AGW Edge Gateway — Structured Logger
Configura structlog para salida JSON en producción y pretty-print en desarrollo
"""
from __future__ import annotations

import logging
import os
import sys

import structlog


def setup_logging(level: str | None = None) -> None:
    """
    Configura structlog globalmente.

    - En producción (AGW_ENV=production): JSON renderer — compatible con Loki/CloudWatch
    - En desarrollo: ConsoleRenderer con colores
    """
    log_level = level or os.getenv("AGW_LOG_LEVEL", "INFO").upper()
    env = os.getenv("AGW_ENV", "development")

    # Processors compartidos
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if env == "production":
        # JSON estructurado para ingestión por Loki / CloudWatch
        renderer = structlog.processors.JSONRenderer()
    else:
        # Colored pretty-print para desarrollo
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configurar stdlib logging
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level, logging.INFO))

    # Silenciar loggers ruidosos
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # ── Colisión de namespace con aiomqtt ────────────────────────
    # aiomqtt hace `logging.getLogger("mqtt").setLevel(WARNING)` al
    # importarse. Nuestro paquete local también se llama `mqtt`, así que
    # `mqtt.broker_client` y `mqtt.message_handler` heredaban ese nivel
    # y TODOS sus log.info() se descartaban sin dejar rastro: el gateway
    # procesaba telemetría correctamente pero no lo registraba.
    #
    # NOTSET devuelve el logger a herencia del root. El de aiomqtt en sí
    # queda en su propio nivel via el logger hijo `mqtt.client`.
    logging.getLogger("mqtt").setLevel(logging.NOTSET)
    logging.getLogger("mqtt.client").setLevel(logging.WARNING)
