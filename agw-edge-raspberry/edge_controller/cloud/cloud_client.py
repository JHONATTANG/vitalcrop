"""
AGW Edge Gateway — Cloud HTTP Client
httpx AsyncClient compartido con retry y circuit breaker básico
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog

log = structlog.get_logger()


class CloudClient:
    """
    Wrapper de httpx.AsyncClient con:
    - Auth por Bearer token
    - Retry con backoff exponencial
    - Circuit breaker básico (falla rápido tras N errores consecutivos)
    """

    def __init__(self, config):
        self.config = config
        self._consecutive_errors = 0
        self._circuit_open = False
        self._circuit_reset_at: float = 0.0

        self._client = httpx.AsyncClient(
            base_url=config.cloud.api_base_url,
            headers={
                "Authorization": f"Bearer {config.cloud.api_key}",
                "Content-Type": "application/json",
                "X-Gateway-ID": config.device.gateway_id,
            },
            timeout=config.cloud.push_timeout_seconds,
        )

    async def get(self, endpoint: str, **kwargs) -> httpx.Response:
        return await self._request("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, json: Any = None, **kwargs) -> httpx.Response:
        return await self._request("POST", endpoint, json=json, **kwargs)

    async def patch(self, endpoint: str, json: Any = None, **kwargs) -> httpx.Response:
        return await self._request("PATCH", endpoint, json=json, **kwargs)

    async def _request(
        self,
        method: str,
        endpoint: str,
        retries: int | None = None,
        **kwargs,
    ) -> httpx.Response:
        max_retries = retries if retries is not None else self.config.cloud.retry_max

        # Circuit breaker: si está abierto y aún no pasó el tiempo de reset
        if self._circuit_open:
            import time
            if time.monotonic() < self._circuit_reset_at:
                raise RuntimeError("Cloud circuit breaker OPEN — skipping request")
            else:
                log.info("Cloud circuit breaker HALF-OPEN — attempting reset")
                self._circuit_open = False

        for attempt in range(max_retries + 1):
            try:
                resp = await self._client.request(method, endpoint, **kwargs)
                resp.raise_for_status()
                self._consecutive_errors = 0
                return resp
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                self._consecutive_errors += 1
                if attempt == max_retries:
                    # Abrir circuit breaker tras 10 errores consecutivos
                    if self._consecutive_errors >= 10:
                        import time
                        self._circuit_open = True
                        self._circuit_reset_at = time.monotonic() + 30.0
                        log.error(
                            "Cloud circuit breaker OPENED",
                            consecutive_errors=self._consecutive_errors,
                        )
                    raise
                wait = min(2 ** attempt, 30)
                log.warning(
                    "Cloud request failed — retrying",
                    method=method,
                    endpoint=endpoint,
                    attempt=attempt + 1,
                    retry_in=wait,
                    error=str(exc),
                )
                await asyncio.sleep(wait)

        raise RuntimeError("Unreachable")  # pragma: no cover

    async def close(self) -> None:
        await self._client.aclose()
