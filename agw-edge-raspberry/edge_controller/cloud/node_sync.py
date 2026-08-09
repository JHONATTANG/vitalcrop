"""
AGW Edge Gateway — Sincronizador del nodo
==========================================
Mantiene al ESP32 con la hora correcta y con el programa de cultivo que
la Raspberry considera vigente.

POR QUÉ EXISTE
El ESP32 no tiene reloj con batería: al arrancar no sabe qué hora es y
entra en MODO DEGRADADO, donde asume día permanente. Con el fotoperiodo
activo eso significa la luz encendida 24 h — un fallo silencioso, porque
el nodo sigue publicando telemetría con normalidad mientras el cultivo
recibe el doble de luz de la programada.

Un corte de energía, un watchdog o un reflasheo bastan para perder la
hora. Por eso no vale con enviarla una vez a mano: hace falta un servicio
que la reponga sin intervención.

QUÉ HACE
  1. Al arrancar el edge y cada vez que el nodo se reconecta, le envía
     la hora local y el programa completo.
  2. Resincroniza periódicamente para corregir la deriva del oscilador
     del ESP32 (unos segundos al día).
  3. Vigila el campo `hora_valida` del status: si el nodo reporta que la
     perdió, se la repone de inmediato sin esperar al siguiente ciclo.

ZONA HORARIA
Se envía la hora LOCAL, no UTC. El fotoperiodo se configura en horas de
reloj de pared ("luz de 06:00 a 20:00") y así el nodo puede compararlas
directamente sin conocer husos ni cambios de horario.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta

import structlog

from mqtt.topics import Topics

log = structlog.get_logger("agw.nodesync")

# Cada cuánto se reenvía la hora. El oscilador del ESP32 deriva unos
# segundos al día: una hora es de sobra para mantenerlo alineado.
INTERVALO_RESYNC_S = 3600

# Espera inicial: da tiempo a que el broker levante y el nodo asocie.
ESPERA_INICIAL_S = 15


class NodeSync:
    """Mantiene hora y programa del nodo alineados con el gateway."""

    def __init__(self, config, mqtt_client, local_db=None):
        self.config = config
        self.mqtt = mqtt_client
        self.local_db = local_db

        self.stats = {
            "hora_enviada": 0,
            "programa_enviado": 0,
            "resync_por_perdida": 0,
            "ultima_sync": None,
        }

        # El programa vigente. Vive aquí y en SQLite; el nodo solo lo
        # ejecuta. Si alguna vez discrepan, manda el gateway.
        self.programa = {
            "hora_luz_on": 6,
            "hora_luz_off": 20,
            "hidro_riego_dia_s": 900,
            "hidro_descanso_dia_s": 900,
            "hidro_riego_noche_s": 600,
            "hidro_descanso_noche_s": 7200,
            "tierra_cada_dias": 15,
            "tierra_hora": 7,
            "telemetria_s": 60,
        }

    # ─────────────────────────────────────────────────────────────

    async def enviar_hora(self, motivo: str = "periodica") -> None:
        """
        Envía la hora LOCAL como epoch.

        El ESP32 hace localtime_r() sobre lo que reciba sin aplicar
        desplazamiento de zona. Mandarle UTC haría que su "06:00" fueran
        la 01:00 reales en Colombia, y el fotoperiodo quedaría corrido
        cinco horas sin que nada lo delatara.
        """
        ahora = datetime.now()                    # hora local del sistema
        # Desfase respecto a UTC según la zona configurada en la Pi.
        # Colombia no aplica horario de verano, pero se consulta igual
        # para no romper si el sistema se despliega en otra zona.
        offset = -time.altzone if time.daylight and time.localtime().tm_isdst else -time.timezone
        epoch_local = int(time.time()) + offset

        await self.mqtt.publish(Topics.CMD, {"cmd": "set_hora", "epoch": epoch_local})
        self.stats["hora_enviada"] += 1
        self.stats["ultima_sync"] = ahora.isoformat(timespec="seconds")
        log.info(
            "Hora enviada al nodo",
            motivo=motivo,
            hora_local=ahora.strftime("%Y-%m-%d %H:%M:%S"),
            offset_h=offset / 3600,
        )

    async def enviar_programa(self, motivo: str = "periodica") -> None:
        """Empuja el programa de cultivo completo."""
        payload = {"cmd": "set_programa", **self.programa}

        # Fecha del próximo riego de tierra. El nodo tiene además su
        # propio contador por si nunca recibe esto, pero mientras haya
        # gateway manda el calendario: es el que la app web muestra.
        proximo = await self._calcular_proximo_riego_tierra()
        if proximo:
            payload["proximo_riego_tierra"] = int(proximo.timestamp())

        await self.mqtt.publish(Topics.CMD, payload)
        self.stats["programa_enviado"] += 1
        log.info("Programa enviado al nodo", motivo=motivo,
                 proximo_riego=proximo.isoformat() if proximo else None)

    async def _calcular_proximo_riego_tierra(self) -> datetime | None:
        """
        Próximo riego de tierra según el historial local.

        Si nunca se ha regado, se programa para la hora indicada del día
        siguiente: arrancar regando nada más encender el sistema sería
        una sorpresa desagradable.
        """
        ultimo = None
        if self.local_db:
            try:
                ultimo = await self.local_db.get_ultimo_riego_tierra()
            except Exception as exc:
                log.debug("Sin historial de riego de tierra", error=str(exc))

        base = ultimo or datetime.now()
        proximo = base + timedelta(days=self.programa["tierra_cada_dias"])
        return proximo.replace(
            hour=self.programa["tierra_hora"], minute=0, second=0, microsecond=0
        )

    # ─────────────────────────────────────────────────────────────

    async def al_recibir_status(self, status: dict) -> None:
        """
        Lo llama MessageHandler con cada heartbeat.

        Detectar aquí la pérdida de hora es lo que evita el fallo
        silencioso: el nodo avisa en su propio status, y reponerla cuesta
        un mensaje.
        """
        if status.get("hora_valida") is False or status.get("degradado") is True:
            self.stats["resync_por_perdida"] += 1
            log.warning(
                "El nodo perdio la hora — reponiendola",
                node=status.get("node_id"),
                uptime_ms=status.get("uptime_ms"),
            )
            await self.enviar_hora(motivo="nodo en degradado")
            await self.enviar_programa(motivo="tras reponer hora")

        if status.get("huerfano"):
            log.warning(
                "El nodo se declara huerfano: no recibia mensajes del gateway",
                node=status.get("node_id"),
            )

    # ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        await asyncio.sleep(ESPERA_INICIAL_S)

        # Primer envío: es el que saca al nodo del modo degradado tras
        # un corte de energía que apagara a los dos.
        try:
            await self.enviar_hora(motivo="arranque del gateway")
            await self.enviar_programa(motivo="arranque del gateway")
        except Exception as exc:
            log.warning("Fallo la sincronizacion inicial", error=str(exc))

        while True:
            await asyncio.sleep(INTERVALO_RESYNC_S)
            try:
                await self.enviar_hora()
            except Exception as exc:
                log.warning("Fallo el resync de hora", error=str(exc))
