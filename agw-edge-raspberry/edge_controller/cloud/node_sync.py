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
from datetime import datetime, timedelta, timezone

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
            "resync_por_reasociacion": 0,
            "ultima_sync": None,
        }

        # El programa vigente. Vive aquí y en SQLite; el nodo solo lo
        # ejecuta. Si alguna vez discrepan, manda el gateway.
        #
        # Sale de config.yaml y no de literales en el código: estaba
        # escrito aquí con 15 días de riego de tierra, así que cualquier
        # cambio hecho sobre el nodo lo revertía este envío en el
        # siguiente arranque del gateway, sin dejar rastro de por qué.
        self.programa = config.programa.model_dump()

        # Último riego de tierra según lo reporta el propio nodo. Es él
        # quien abre la válvula, así que es la única fuente que sabe
        # cuándo se regó de verdad.
        self.ultimo_riego_nodo: datetime | None = None
        self._ultimo_epoch_registrado: int = 0

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
        # Prioridad al nodo: es quien abre la válvula y quien sabe si el
        # riego llegó a ocurrir. El historial local es el respaldo para
        # cuando el gateway arranca antes de haber recibido un status.
        #
        # Sin esto el cálculo partía SIEMPRE de datetime.now(), porque
        # nadie escribía el historial: cada reinicio del nodo empujaba el
        # próximo riego diez días más allá y la tierra no se regaba nunca.
        ultimo = self.ultimo_riego_nodo

        if ultimo is None and self.local_db:
            try:
                ultimo = await self.local_db.get_ultimo_riego_tierra()
            except Exception as exc:
                log.debug("Sin historial de riego de tierra", error=str(exc))

        base = ultimo or datetime.now()
        proximo = base + timedelta(days=self.programa["tierra_cada_dias"])
        return proximo.replace(
            hour=self.programa["tierra_hora"], minute=0, second=0, microsecond=0
        )

    def _a_hora_local(self, epoch: int) -> datetime:
        """
        Epoch del nodo → datetime local ingenuo.

        El nodo recibe la hora LOCAL como epoch (ver enviar_hora) y la
        devuelve igual. Pasarla por fromtimestamp() volvería a aplicar el
        desplazamiento de zona y el resultado saldría cinco horas
        corrido, que es de las desviaciones más difíciles de ver en un
        log porque sigue pareciendo una fecha razonable.
        """
        return datetime.fromtimestamp(epoch, tz=timezone.utc).replace(tzinfo=None)

    async def _anotar_riego_del_nodo(self, status: dict) -> None:
        """Registra el último riego de tierra que reporta el nodo."""
        try:
            epoch = int(status.get("ult_riego_tierra") or 0)
        except (TypeError, ValueError):
            return

        # 1.7e9 ≈ 2023. Por debajo el nodo no tenía hora válida cuando
        # regó, y esa marca no sirve para calendario alguno.
        if epoch < 1_700_000_000 or epoch == self._ultimo_epoch_registrado:
            return

        self._ultimo_epoch_registrado = epoch
        self.ultimo_riego_nodo = self._a_hora_local(epoch)
        log.info(
            "El nodo reporta riego de tierra",
            cuando=self.ultimo_riego_nodo.isoformat(timespec="seconds"),
        )

        if not self.local_db:
            return
        try:
            await self.local_db.registrar_riego_tierra(
                status.get("node_id") or status.get("id") or "desconocido",
                {
                    "epoch": epoch,
                    "duracion_s": (status.get("tierra") or {}).get("ult_seg"),
                    "corte": (status.get("tierra") or {}).get("corte"),
                    "ec_antes": (status.get("tierra") or {}).get("ec_antes"),
                    "ec_despues": (status.get("tierra") or {}).get("ec_despues"),
                },
            )
        except Exception as exc:
            log.warning("No se pudo registrar el riego de tierra", error=str(exc))

        # Reenviar el programa con la fecha recalculada. El nodo se
        # programa el siguiente riego por su cuenta, pero a la hora en
        # que rego, no a la hora del calendario; y hasta el siguiente
        # arranque del gateway las dos fechas quedaban discrepando sin
        # que nada lo dijera. Un envio aqui las deja iguales.
        #
        # No se realimenta: esto solo corre cuando la fecha del nodo
        # CAMBIA, y enviar el programa no hace que el nodo riegue.
        try:
            await self.enviar_programa(motivo="tras riego de tierra")
        except Exception as exc:
            log.warning("No se pudo reenviar el programa", error=str(exc))

    # ─────────────────────────────────────────────────────────────

    async def al_reasociarse(self, mac: str = "") -> None:
        """
        Lo llama APWatcher cuando la estación vuelve al punto de acceso.

        Reasociarse al WiFi es, en la práctica, la firma de un reinicio
        del ESP32, y un ESP32 recién arrancado no tiene hora: no lleva
        reloj de tiempo real. Reponerla aquí es lo que evita que ejecute
        el fotoperiodo equivocado hasta el siguiente heartbeat.

        Se manda también el programa. Los módulos y el plan viven en NVS
        y sobreviven al reinicio, así que en teoría no haría falta; pero
        si lo que hubo fue un borrado de NVS o un reflasheo, esto es lo
        único que devuelve el nodo a su configuración real.
        """
        self.stats["resync_por_reasociacion"] += 1
        await self.enviar_hora(motivo=f"reasociacion wifi {mac}".strip())
        await self.enviar_programa(motivo="tras reasociacion wifi")

    async def al_recibir_status(self, status: dict) -> None:
        """
        Lo llama MessageHandler con cada heartbeat.

        Detectar aquí la pérdida de hora es lo que evita el fallo
        silencioso: el nodo avisa en su propio status, y reponerla cuesta
        un mensaje.
        """
        await self._anotar_riego_del_nodo(status)

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
