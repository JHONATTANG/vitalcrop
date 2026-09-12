"""
AGW Edge Gateway — Webhook: la nube avisa al gateway
=====================================================
Dos piezas:

  · `verificar_firma`: comprueba un aviso entrante. HMAC-SHA256 sobre
    `timestamp.cuerpo` con el secreto compartido (AGW_WEBHOOK_SECRET),
    y el timestamp a menos de 5 min: una petición capturada no sirve
    después. Comparación en tiempo constante.

  · `Anunciador`: le dice a la nube dónde recibir avisos. Al arrancar,
    cada 6 h, y —lo que importa— en cuanto vuelve la conectividad tras
    un corte, porque la nube puede haber olvidado la URL o haberse
    redesplegado. Si no hay URL configurada, anuncia `null` y la nube
    vuelve a solo sondeo: es la forma de apagar el webhook sin tocar
    la nube.

La URL pública la da Tailscale Funnel: expone el puerto del servidor
de salud (8080) en https://<maquina>.<tailnet>.ts.net sin abrir nada
en el router. Que la URL sea pública no importa: sin la firma, el
gateway responde 401 y no hace nada.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import time

import structlog

from cloud.cloud_client import CloudClient

log = structlog.get_logger("agw.webhook")

TOLERANCIA_S = 300
REANUNCIO_S = 6 * 3600


def verificar_firma(secreto: str, timestamp: str, firma: str, cuerpo: bytes) -> tuple[bool, str]:
    """(válida, motivo). El motivo solo se registra: al remitente se le dice 401 y nada más."""
    if not secreto:
        return False, "sin secreto configurado"
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False, "timestamp inválido"
    if abs(time.time() - ts) > TOLERANCIA_S:
        return False, f"timestamp fuera de ventana ({int(time.time()) - ts}s)"
    esperada = hmac.new(secreto.encode(), f"{timestamp}.".encode() + cuerpo, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(esperada, (firma or "").strip().lower()):
        return False, "firma incorrecta"
    return True, "ok"


class Anunciador:
    """Mantiene a la nube al tanto de la URL del webhook."""

    ENDPOINT = "/api/iot/gateway/webhook"

    def __init__(self, config):
        self.config = config
        self._cloud = CloudClient(config)
        self._url = (config.cloud.webhook_url or "").strip() or None
        self._despertador = asyncio.Event()
        self.stats = {"anuncios_ok": 0, "anuncios_fallidos": 0}

    def reanunciar(self) -> None:
        """Pide un anuncio inmediato (p. ej. al recuperar la conectividad)."""
        self._despertador.set()

    async def anunciar(self) -> bool:
        try:
            await self._cloud.post(self.ENDPOINT, json={
                "gateway_id": self.config.device.gateway_id,
                "url": self._url,
            }, retries=1)
            self.stats["anuncios_ok"] += 1
            log.info("Webhook anunciado a la nube", url=self._url or "ninguno (solo sondeo)")
            return True
        except Exception as exc:
            self.stats["anuncios_fallidos"] += 1
            log.warning("No se pudo anunciar el webhook", error=str(exc))
            return False

    async def run(self) -> None:
        if not getattr(self.config.cloud, "enabled", True):
            while True:
                await asyncio.sleep(3600)
        if not self.config.cloud.webhook_secret:
            log.warning("AGW_WEBHOOK_SECRET vacío: los avisos de la nube se rechazarán; "
                        "las órdenes llegarán solo por el sondeo de respaldo")
        # El primer anuncio espera a que el resto arranque y la red esté.
        await asyncio.sleep(10)
        while True:
            ok = await self.anunciar()
            # Si falló, reintenta pronto; si fue bien, hasta el siguiente
            # ciclo o hasta que alguien pida reanunciar.
            espera = 120 if not ok else REANUNCIO_S
            try:
                await asyncio.wait_for(self._despertador.wait(), timeout=espera)
            except asyncio.TimeoutError:
                pass
            self._despertador.clear()

    async def close(self) -> None:
        await self._cloud.close()
