#!/usr/bin/env bash
# ============================================================
#  activar_webhook.sh — Actualiza el gateway y abre el webhook
# ============================================================
#  Se ejecuta EN la Raspberry, con sudo, desde agw-edge-raspberry/:
#
#      sudo AGW_WEBHOOK_SECRET=<secreto> ./scripts/activar_webhook.sh
#
#  Hace, en orden y parando si algo falla:
#    1. copia de seguridad del edge_controller que está corriendo
#    2. copia el edge_controller nuevo (sin tocar el .env)
#    3. añade al .env el secreto del webhook, la URL pública y el
#       sondeo de respaldo a 10 min (solo si no estaban)
#    4. expone el puerto 8080 con Tailscale Funnel y anota la URL
#    5. reinicia el servicio y comprueba que anuncia el webhook
#
#  Si Funnel no está habilitado en el tailnet, el paso 4 imprime el
#  enlace para habilitarlo y el script sigue: el gateway queda con el
#  sondeo de respaldo hasta que se repita este script.
set -euo pipefail

DEST=/opt/agw-edge
SVC=agw-edge
PUERTO=8080

say() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecutar con sudo"
[ -d ./edge_controller ] || die "Ejecutar desde agw-edge-raspberry/"
[ -n "${AGW_WEBHOOK_SECRET:-}" ] || die "Falta AGW_WEBHOOK_SECRET en el entorno"

# ── 1. copia de seguridad ─────────────────────────────────────
SELLO=$(date +%Y%m%d-%H%M%S)
say "Copia de seguridad en $DEST/backup-$SELLO"
mkdir -p "$DEST/backup-$SELLO"
cp -r "$DEST/edge_controller" "$DEST/backup-$SELLO/"
cp "$DEST/.env" "$DEST/backup-$SELLO/.env"

# ── 2. código nuevo ───────────────────────────────────────────
say "Copiando edge_controller"
rm -rf "$DEST/edge_controller"
cp -r ./edge_controller "$DEST/"
find "$DEST/edge_controller" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
"$DEST/venv/bin/python" -m py_compile "$DEST"/edge_controller/*.py "$DEST"/edge_controller/*/*.py
say "Sintaxis correcta"

# ── 3. .env ───────────────────────────────────────────────────
pon() {  # pon CLAVE VALOR: añade o reemplaza en el .env
    if grep -qE "^$1=" "$DEST/.env"; then
        sed -i "s|^$1=.*|$1=$2|" "$DEST/.env"
    else
        printf '%s=%s\n' "$1" "$2" >> "$DEST/.env"
    fi
}
pon AGW_WEBHOOK_SECRET "$AGW_WEBHOOK_SECRET"
pon AGW_CLOUD_POLL_INTERVAL_S 600
chmod 600 "$DEST/.env"

# ── 4. Tailscale Funnel ───────────────────────────────────────
say "Exponiendo el puerto $PUERTO con Tailscale Funnel"
URL=""
if tailscale funnel --bg "$PUERTO" >/tmp/funnel.out 2>&1; then
    URL=$(tailscale funnel status 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.ts\.net[^ ]*' | head -1 | sed 's#/*$##')
fi
if [ -n "$URL" ]; then
    pon AGW_WEBHOOK_URL "$URL"
    say "Funnel activo: $URL"
else
    cat /tmp/funnel.out || true
    printf '\n\033[1;33mAVISO:\033[0m Funnel no quedó activo. El gateway seguirá con el sondeo de respaldo.\n'
    printf 'Habilita Funnel en el tailnet (el enlace de arriba) y vuelve a correr este script.\n'
    pon AGW_WEBHOOK_URL ""
fi

# ── 5. reinicio y comprobación ────────────────────────────────
say "Reiniciando $SVC"
systemctl restart "$SVC"
sleep 15
systemctl is-active --quiet "$SVC" || { journalctl -u "$SVC" -n 30 --no-pager; die "$SVC no arrancó"; }
say "Servicio activo. Últimas líneas relevantes:"
journalctl -u "$SVC" --since "-40s" --no-pager | grep -iE "webhook|ordenes|aviso|alerta|error" | tail -12 || true

if [ -n "$URL" ]; then
    say "Comprobando el webhook desde fuera"
    codigo=$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "$URL/webhook/ordenes" -d '{}' || echo 000)
    if [ "$codigo" = "401" ]; then
        say "Correcto: sin firma responde 401 (la ruta es pública y está protegida)"
    else
        printf '\n\033[1;33mAVISO:\033[0m el webhook público respondió %s (esperaba 401)\n' "$codigo"
    fi
fi
say "Listo"
