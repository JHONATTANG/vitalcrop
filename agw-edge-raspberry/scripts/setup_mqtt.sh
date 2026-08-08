#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  AGW Edge Gateway — Mosquitto MQTT Setup
#  Crea usuarios y configura el broker
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

log()  { echo -e "\033[0;32m[MQTT]\033[0m $*"; }
warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[0;31m[ERR]\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root"

PASSWD_FILE="/etc/mosquitto/passwd"
ACL_FILE="/etc/mosquitto/acl"
CONF_FILE="/etc/mosquitto/mosquitto.conf"

# ── Contraseñas por defecto (sobreescribir con env vars) ─────────
ESP32_PASSWORD="${MQTT_ESP32_PASSWORD:-Esp32IoT2024!}"
EDGE_PASSWORD="${MQTT_EDGE_PASSWORD:-EdgeCtrl2024!}"

# ── Crear/actualizar passwd file ──────────────────────────────────
log "Creating Mosquitto password file..."

# Crear archivo vacío con permisos correctos
touch "$PASSWD_FILE"
chmod 640 "$PASSWD_FILE"
chown root:mosquitto "$PASSWD_FILE"

# Agregar/actualizar usuarios
mosquitto_passwd -b "$PASSWD_FILE" esp32_node "$ESP32_PASSWORD"
log "  → User 'esp32_node' created"

mosquitto_passwd -b "$PASSWD_FILE" edge_controller "$EDGE_PASSWORD"
log "  → User 'edge_controller' created"

# ── Copiar ACL file ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$REPO_DIR/system/mosquitto/acl" ]]; then
    cp "$REPO_DIR/system/mosquitto/acl" "$ACL_FILE"
    chmod 640 "$ACL_FILE"
    chown root:mosquitto "$ACL_FILE"
    log "  → ACL file installed"
fi

# ── Crear directorio de logs ──────────────────────────────────────
mkdir -p /var/log/mosquitto
chown mosquitto:mosquitto /var/log/mosquitto

# ── Habilitar y reiniciar Mosquitto ──────────────────────────────
log "Enabling and starting Mosquitto..."
systemctl enable mosquitto
systemctl restart mosquitto

# Verificar que arrancó correctamente
sleep 2
if systemctl is-active --quiet mosquitto; then
    log "Mosquitto is running ✓"
    log "  → IoT listener: 10.10.0.1:1883 (auth required)"
    log "  → Local listener: 127.0.0.1:1884 (anonymous)"
else
    err "Mosquitto failed to start. Check: journalctl -u mosquitto -n 50"
fi

log ""
log "MQTT credentials:"
log "  esp32_node    → password: $ESP32_PASSWORD"
log "  edge_controller → password: $EDGE_PASSWORD"
warn "Change default passwords via env vars: MQTT_ESP32_PASSWORD / MQTT_EDGE_PASSWORD"
warn "Update edge_controller/config.yaml with the edge_controller password"
