"""
AGW Edge Gateway — Ritmo: cada cuánto se habla con la nube
============================================================
Un solo objeto decide la cadencia de TODO el tráfico hacia la nube:
telemetría, eventos y el sondeo de respaldo de órdenes. Si cada
remitente llevara su propio reloj, la base de datos de la nube
recibiría una visita cada pocos minutos de uno u otro y no dormiría
nunca; con un ritmo común, todos suben en la misma ventana y la base
descansa entre ventanas.

DOS MODOS

  dormido    nadie mira el panel. Se acumula en el SQLite y se sube
             cada `batch_dormido_s` (30 min). La base de la nube
             duerme entre lotes.

  despierto  hay un usuario con sesión iniciada mirando sus nodos. El
             panel manda latidos y la nube los reenvía al gateway como
             una PRESENCIA con vencimiento; mientras no venza, se sube
             cada `batch_activo_s` (2 min). El primer cambio a despierto
             sube en el acto, para que el panel no espere.

La presencia caduca sola: si el usuario cierra la pestaña, se queda
quieto o pierde la red, no llega más latido, el vencimiento pasa y el
gateway vuelve a dormir sin que nadie tenga que avisarle. Es a prueba
de olvidos por construcción.

Lo que NO sigue este ritmo: las alertas que se abren o se cierran (una
vez cada muchas horas, y son lo que sí importa saber ya) y el aviso de
órdenes por webhook. Eso despierta al remitente que toque al instante.
"""
from __future__ import annotations

import asyncio
import time
from typing import Callable

import structlog

log = structlog.get_logger("agw.ritmo")


class Ritmo:
    def __init__(self, activo_s: int, dormido_s: int):
        self.activo_s = activo_s
        self.dormido_s = dormido_s
        self._presencia_hasta: float = 0.0
        self._al_despertar: list[Callable[[], None]] = []
        self.stats = {"presencias": 0, "despertares": 0}

    # ── estado ───────────────────────────────────────────────────

    @property
    def despierto(self) -> bool:
        return time.time() < self._presencia_hasta

    @property
    def intervalo(self) -> int:
        return self.activo_s if self.despierto else self.dormido_s

    @property
    def presencia_restante_s(self) -> int:
        return max(0, int(self._presencia_hasta - time.time()))

    def describir(self) -> dict:
        return {
            "modo": "despierto" if self.despierto else "dormido",
            "intervalo_s": self.intervalo,
            "presencia_restante_s": self.presencia_restante_s,
        }

    # ── presencia ────────────────────────────────────────────────

    def al_despertar(self, cb: Callable[[], None]) -> None:
        """Se llama una vez cada vez que se pasa de dormido a despierto."""
        self._al_despertar.append(cb)

    def marcar_presencia(self, segundos: int) -> bool:
        """
        Hay alguien mirando: mantener el modo despierto `segundos` más.
        Devuelve True si esto lo despertó (estaba dormido).
        """
        self.stats["presencias"] += 1
        estaba_dormido = not self.despierto
        self._presencia_hasta = max(self._presencia_hasta, time.time() + segundos)
        if estaba_dormido:
            self.stats["despertares"] += 1
            log.info("Hay alguien en el panel: modo despierto", cada_s=self.activo_s,
                     hasta_dentro_de_s=segundos)
            for cb in self._al_despertar:
                try:
                    cb()
                except Exception as exc:                      # noqa: BLE001
                    log.debug("Callback de despertar falló", error=str(exc))
        return estaba_dormido

    # ── espera ───────────────────────────────────────────────────

    async def esperar(self, despertador: asyncio.Event, ultimo_envio: float) -> str:
        """
        Duerme hasta que toque enviar según el modo actual, o hasta que
        alguien dispare `despertador`. Se reevalúa cada 15 s porque el
        modo puede cambiar mientras se espera (llega una presencia y el
        intervalo pasa de 30 min a 2). Devuelve por qué salió.
        """
        while True:
            vence = ultimo_envio + self.intervalo
            falta = vence - time.time()
            if falta <= 0:
                return "ritmo"
            try:
                await asyncio.wait_for(despertador.wait(), timeout=min(falta, 15))
                despertador.clear()
                return "aviso"
            except asyncio.TimeoutError:
                continue
