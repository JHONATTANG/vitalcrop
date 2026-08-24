"""
AGW Edge — Vigilante de asociaciones del punto de acceso
=========================================================

POR QUE EXISTE

El nodo pierde la hora en cada arranque: el ESP32 no tiene reloj de
tiempo real. Hasta ahora el gateway se enteraba de que había que
reponérsela por dos vías, y las dos llegan tarde:

  1. El propio nodo lo confesaba en su heartbeat (`hora_valida: false`).
     Depende de que el módulo `status` esté encendido y de que haya
     pasado el ciclo de 60 s. Si el nodo arranca en modo degradado y
     alguien apagó el status, no se entera nunca.

  2. El resync horario periódico, cada hora. Un nodo que se reinicia
     justo después puede pasar 59 minutos ejecutando el fotoperiodo
     equivocado, que es exactamente el fallo silencioso que el proyecto
     dice evitar.

Ninguna de las dos observa lo que de verdad ocurre: que la estación se
va del WiFi y vuelve. Esa transición es inmediata, no depende de ningún
módulo del firmware y no puede confundirse con un nodo lento. Es la
señal correcta, y es la que mira este vigilante.

COMO LO MIRA

`hostapd_cli list_sta` pregunta al AP qué estaciones tiene asociadas
AHORA. El socket de control de hostapd es de root, y el servicio
agw-edge corre como root, así que funciona desde dentro del proceso.

Se muestrea en vez de escuchar eventos porque hostapd entrega los suyos
por un socket que habría que mantener abierto y reconectar cuando
hostapd se reinicia; un sondeo cada 10 s detecta la reasociación con la
misma utilidad práctica y sin estado que se pueda corromper.
"""
from __future__ import annotations

import asyncio
import os
import re
import shutil

import structlog

log = structlog.get_logger()

# Una MAC por línea es lo que imprime `list_sta`; el resto de líneas
# (avisos, 'Selected interface') se descartan por no encajar aquí.
_MAC_RE = re.compile(r"^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$", re.IGNORECASE)

# Rutas absolutas primero, y el PATH solo como último recurso: el binario
# vive en /usr/sbin, que no está en el PATH de un usuario normal ni,
# según la distribución, en el que systemd le da a los servicios. Buscarlo
# solo por PATH deja el vigilante dormido con un aviso que nadie lee.
_RUTAS_HOSTAPD_CLI = ("/usr/sbin/hostapd_cli", "/sbin/hostapd_cli",
                      "/usr/local/sbin/hostapd_cli")
_TIMEOUT_S = 5


def _buscar_hostapd_cli() -> str | None:
    for ruta in _RUTAS_HOSTAPD_CLI:
        if os.access(ruta, os.X_OK):
            return ruta
    return shutil.which("hostapd_cli")


class APWatcher:
    """Repone hora y programa cuando una estación vuelve al AP."""

    def __init__(self, config, node_sync):
        self.cfg = config.ap_watcher
        self.node_sync = node_sync
        self.asociadas: set[str] = set()
        self.primer_muestreo = True
        self.binario = _buscar_hostapd_cli()

        self.stats = {
            "reasociaciones": 0,
            "desasociaciones": 0,
            "sondeos_fallidos": 0,
        }

    # ─────────────────────────────────────────────────────────────

    async def _listar_estaciones(self) -> set[str] | None:
        """
        MACs asociadas al AP, o None si no se pudo averiguar.

        None y conjunto vacío significan cosas distintas y no deben
        confundirse: vacío es "no hay nadie conectado", None es "no lo
        sé". Tratar un fallo del sondeo como conjunto vacío haría que el
        siguiente sondeo correcto pareciera una reasociación masiva.
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                self.binario, "-i", self.cfg.interface, "list_sta",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            salida, err = await asyncio.wait_for(proc.communicate(), timeout=_TIMEOUT_S)
        except asyncio.TimeoutError:
            self._fallo("hostapd_cli no respondio a tiempo")
            return None
        except Exception as exc:
            self._fallo("Fallo el sondeo de estaciones", error=str(exc))
            return None

        if proc.returncode != 0:
            self._fallo("hostapd_cli devolvio error",
                        codigo=proc.returncode,
                        stderr=err.decode(errors="replace").strip()[:200])
            return None

        return {
            linea.strip().lower()
            for linea in salida.decode(errors="replace").splitlines()
            if _MAC_RE.match(linea.strip())
        }

    def _fallo(self, mensaje: str, **datos) -> None:
        """
        Un sondeo que no se pudo hacer.

        Los primeros fallos van a WARNING y despues se espacian. La
        version anterior los mandaba TODOS a debug, que no se ve en
        produccion: el vigilante llevaba cinco dias sin funcionar —
        hostapd_cli fallaba en cada sondeo— y en el log solo aparecia
        la linea de "en marcha" del arranque. Un vigilante cuyo modo de
        fallo es el silencio no vigila nada.
        """
        self.stats["sondeos_fallidos"] += 1
        n = self.stats["sondeos_fallidos"]

        # 1, 2, 3, y luego uno de cada 60 (una hora con el sondeo a 60 s)
        if n <= 3 or n % 60 == 0:
            log.warning(mensaje, fallos_seguidos=n,
                        binario=self.binario, interfaz=self.cfg.interface,
                        pista="si el servicio corre con PrivateTmp=yes, hostapd "
                              "no puede responder al socket cliente de hostapd_cli",
                        **datos)

    def _vigiladas(self, macs: set[str]) -> set[str]:
        """Filtra por la MAC del nodo, si se configuró una."""
        objetivo = self.cfg.node_mac.strip().lower()
        if not objetivo:
            return macs          # sin MAC configurada, vale cualquier estación
        return {m for m in macs if m == objetivo}

    async def _al_volver(self, mac: str) -> None:
        self.stats["reasociaciones"] += 1
        log.warning(
            "El nodo se reasocio al WiFi — reponiendo hora y programa",
            mac=mac,
            espera_s=self.cfg.settle_seconds,
        )

        # Margen antes de hablarle. Asociarse al WiFi no es estar
        # suscrito: el nodo todavía tiene que coger IP, conectar con el
        # broker y suscribirse al topic de comandos. PubSubClient abre
        # sesión limpia, así que un mensaje enviado antes de esa
        # suscripción no se encola en ningún sitio: se pierde.
        await asyncio.sleep(self.cfg.settle_seconds)

        try:
            await self.node_sync.al_reasociarse(mac)
        except Exception as exc:
            # Que falle reponer la hora no puede tumbar al vigilante: si
            # muere, se pierde la deteccion de todas las reasociaciones
            # siguientes. El heartbeat sigue siendo la red de seguridad.
            log.warning("Fallo la reposicion tras la reasociacion", error=str(exc))

    # ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        if not self.cfg.enabled:
            log.info("Vigilante del AP desactivado por configuracion")
            await asyncio.Event().wait()      # nunca retorna: ver nota abajo

        if self.binario is None:
            log.warning(
                "No se encontro hostapd_cli: no se vigilaran las "
                "reasociaciones. La hora se repondra solo por heartbeat "
                "y por el resync horario.",
                buscado_en=list(_RUTAS_HOSTAPD_CLI) + ["$PATH"],
            )
            await asyncio.Event().wait()

        # NOTA sobre los `await` de arriba: main.py espera con
        # FIRST_COMPLETED, así que una tarea que retorna se interpreta
        # como caída y apaga el gateway entero. Un vigilante inactivo
        # tiene que quedarse dormido, no terminar.

        log.info(
            "Vigilante del AP en marcha",
            interfaz=self.cfg.interface,
            mac=self.cfg.node_mac or "cualquiera",
            cada_s=self.cfg.poll_seconds,
        )

        while True:
            macs = await self._listar_estaciones()

            if macs is not None:
                presentes = self._vigiladas(macs)

                if self.primer_muestreo:
                    # La primera lectura solo fija el punto de partida.
                    # Sin esto, arrancar el gateway con el nodo ya
                    # conectado se leería como una reasociación y
                    # duplicaría el envío inicial de NodeSync.
                    self.asociadas = presentes
                    self.primer_muestreo = False
                    log.info(
                        "Estado inicial del AP",
                        estaciones=sorted(presentes) or "ninguna",
                    )
                else:
                    for mac in sorted(presentes - self.asociadas):
                        await self._al_volver(mac)

                    for mac in sorted(self.asociadas - presentes):
                        self.stats["desasociaciones"] += 1
                        log.warning("El nodo se fue del WiFi", mac=mac)

                    self.asociadas = presentes

            await asyncio.sleep(self.cfg.poll_seconds)
