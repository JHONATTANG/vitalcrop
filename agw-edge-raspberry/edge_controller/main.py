"""
AGW Edge Gateway — Main Controller
Orquesta todos los servicios async del edge con manejo de señales POSIX
"""
from __future__ import annotations

import asyncio
import signal
import sys

import structlog

from config_loader import load_config
from mqtt.broker_client import MQTTClient
from cloud.sync_telemetry import TelemetrySyncer
from cloud.sync_commands import CommandPoller
from cloud.sync_events import EventSyncer
from cloud.node_sync import NodeSync
from cloud.reconciler import Reconciler
from cloud.webhook import Anunciador
from cloud.ritmo import Ritmo
from rules.rules_engine import RulesEngine
from storage.local_db import LocalDB
from utils.ap_watcher import APWatcher
from utils.health import HealthServer
from utils.logger import setup_logging

log = structlog.get_logger()


# ─────────────────────────────────────────────────────────────────
# Shutdown handler
# ─────────────────────────────────────────────────────────────────

def _install_signal_handlers(shutdown_event: asyncio.Event) -> None:
    """Captura SIGINT/SIGTERM para un shutdown limpio."""
    loop = asyncio.get_event_loop()

    def _handle_signal(sig: signal.Signals) -> None:
        log.warning("Signal received — shutting down", signal=sig.name)
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal, sig)
        except NotImplementedError:
            # Windows no soporta add_signal_handler para todos los casos
            signal.signal(sig, lambda s, f: shutdown_event.set())


# ─────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────

async def main() -> None:
    setup_logging()
    config = load_config()

    log.info(
        "AGW Edge Gateway starting",
        gateway_id=config.device.gateway_id,
        location=config.device.location,
        firmware=config.device.firmware_version,
    )

    shutdown_event = asyncio.Event()
    _install_signal_handlers(shutdown_event)

    # ── Inicializar componentes ──────────────────────────────────
    local_db = LocalDB(config)
    await local_db.initialize()

    rules_engine = RulesEngine(config)
    await rules_engine.load_rules()

    # Un solo ritmo para todo lo que va a la nube: 30 min dormido,
    # 2 min con alguien en el panel. Ver cloud/ritmo.py.
    ritmo = Ritmo(config.cloud.batch_activo_s, config.cloud.batch_dormido_s)
    telemetry_syncer = TelemetrySyncer(config, local_db, ritmo)
    mqtt_client = MQTTClient(config, rules_engine, local_db, telemetry_syncer)
    # Las órdenes van al topic del cultivo de su nodo; la especie la
    # aprende el handler de los topics por los que cada nodo publica.
    command_poller = CommandPoller(config, mqtt_client,
                                   especie_de=mqtt_client.handler.especie_de, ritmo=ritmo)
    # Los eventos del borde no tenian ruta de salida: se quedaban
    # en SQLite y la nube mostraba cifras congeladas.
    event_syncer = EventSyncer(config, local_db, ritmo)
    node_sync = NodeSync(config, mqtt_client, local_db)
    ap_watcher = APWatcher(config, node_sync)
    reconciler = Reconciler(config, node_sync, local_db)
    # El servidor HTTP recibe los avisos de la nube y despierta al poller.
    health_server = HealthServer(config, mqtt_client, local_db, command_poller, ritmo)
    # Y le dice a la nube dónde mandarlos.
    anunciador = Anunciador(config)

    # Una alerta que se abre o se cierra sube en el acto, no en el
    # siguiente ciclo del remitente.
    mqtt_client.set_event_syncer(event_syncer)
    # Especie de cada nodo, para enrutar órdenes aunque el nodo esté
    # callado desde antes de este arranque.
    await mqtt_client.handler.cargar_especies()
    # Cuando la nube vuelve tras un corte: recoger lo encolado y
    # repetir la URL del webhook, por si la nube se redesplegó.
    telemetry_syncer.al_recuperar.append(lambda: command_poller.despertar("reconexion"))
    telemetry_syncer.al_recuperar.append(anunciador.reanunciar)

    # Sin esto las reglas con acción mqtt_publish no llegan al ESP32: el
    # riego automático quedaría inerte y el fallo sería silencioso.
    rules_engine.set_mqtt_publish_callback(mqtt_client.publish)

    # El handler avisa a NodeSync en cada heartbeat: si el nodo reporta
    # que perdio la hora, se le repone de inmediato.
    mqtt_client.set_node_sync(node_sync)

    log.info("All components initialized — starting async tasks")

    # ── Ejecutar todas las tareas concurrentes ───────────────────
    tasks = [
        asyncio.create_task(mqtt_client.run(), name="mqtt-client"),
        asyncio.create_task(telemetry_syncer.run(), name="telemetry-syncer"),
        asyncio.create_task(command_poller.run(), name="command-poller"),
        asyncio.create_task(event_syncer.run(), name="event-syncer"),
        asyncio.create_task(node_sync.run(), name="node-sync"),
        asyncio.create_task(ap_watcher.run(), name="ap-watcher"),
        asyncio.create_task(reconciler.run(), name="reconciler"),
        asyncio.create_task(health_server.run(), name="health-server"),
        asyncio.create_task(anunciador.run(), name="webhook-anunciador"),
        asyncio.create_task(mqtt_client.handler.vigilar_alertas(), name="alertas-vigilante"),
        asyncio.create_task(shutdown_event.wait(), name="shutdown-watcher"),
    ]

    # Esperar hasta que cualquier tarea falle o se reciba shutdown
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)

    # Verificar si alguna tarea falló (no fue el shutdown watcher)
    for task in done:
        if task.get_name() != "shutdown-watcher" and task.exception():
            log.error(
                "Critical task failed",
                task=task.get_name(),
                error=str(task.exception()),
            )

    # Cancelar tareas pendientes
    log.info("Cancelling remaining tasks...")
    for task in pending:
        task.cancel()

    await asyncio.gather(*pending, return_exceptions=True)

    # Cleanup
    await telemetry_syncer.close()
    await anunciador.close()
    await command_poller.close()
    await local_db.close()
    log.info("AGW Edge Gateway stopped cleanly")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Interrupted by user")
        sys.exit(0)
