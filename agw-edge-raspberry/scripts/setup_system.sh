#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  AGW Edge Gateway — Instalación Automática Completa
#  Target: Raspberry Pi 4 — Raspberry Pi OS Lite 64-bit
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

AGW_DIR="/opt/agw"
AGW_USER="pi"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

log()  { echo -e "\033[0;32m[AGW]\033[0m $*"; }
warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
err()  { echo -e "\033[0;31m[ERR]\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root: sudo bash scripts/setup_system.sh"

log "=== AGW Edge Gateway — Setup Started ==="
log "Repo: $REPO_DIR"

# ── 1. Actualizar sistema ─────────────────────────────────────────
log "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Instalar dependencias del sistema ──────────────────────────
log "[2/8] Installing system dependencies..."
apt-get install -y -qq \
    mosquitto mosquitto-clients \
    hostapd dnsmasq \
    python3 python3-pip python3-venv \
    git sqlite3 \
    iptables-persistent netfilter-persistent \
    net-tools iw wireless-tools

# ── 3. Configurar IP estática wlan1 ──────────────────────────────
log "[3/8] Configuring wlan1 static IP (10.10.0.1)..."
if ! grep -q "interface wlan1" /etc/dhcpcd.conf 2>/dev/null; then
    cat >> /etc/dhcpcd.conf << 'EOF'

# AGW IoT Access Point interface
interface wlan1
    static ip_address=10.10.0.1/24
    nohook wpa_supplicant
EOF
    log "  → wlan1 static IP added to dhcpcd.conf"
else
    warn "  → wlan1 already configured in dhcpcd.conf, skipping"
fi

# ── 4. Copiar configuraciones de servicios ────────────────────────
log "[4/8] Installing service configurations..."

# Mosquitto
cp "$REPO_DIR/system/mosquitto/mosquitto.conf" /etc/mosquitto/mosquitto.conf
cp "$REPO_DIR/system/mosquitto/acl" /etc/mosquitto/acl
log "  → Mosquitto config installed"

# hostapd
cp "$REPO_DIR/system/hostapd/hostapd.conf" /etc/hostapd/hostapd.conf
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd
log "  → hostapd config installed"

# dnsmasq (backup original si existe)
[[ -f /etc/dnsmasq.conf ]] && cp /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
cp "$REPO_DIR/system/dnsmasq/dnsmasq.conf" /etc/dnsmasq.conf
log "  → dnsmasq config installed"

# ── 5. Configurar Mosquitto passwords ────────────────────────────
log "[5/8] Configuring Mosquitto users..."
bash "$SCRIPT_DIR/setup_mqtt.sh"

# ── 6. Instalar Edge Controller Python ───────────────────────────
log "[6/8] Installing AGW Edge Controller Python app..."
mkdir -p "$AGW_DIR"

# Crear entorno virtual
python3 -m venv "$AGW_DIR/venv"
"$AGW_DIR/venv/bin/pip" install --upgrade pip -q
"$AGW_DIR/venv/bin/pip" install -r "$REPO_DIR/requirements.txt" -q

# Copiar código fuente
cp -r "$REPO_DIR/edge_controller" "$AGW_DIR/"

# Crear directorio de datos
mkdir -p /var/lib/agw
chown "$AGW_USER:$AGW_USER" /var/lib/agw

# Crear archivo .env con placeholders
if [[ ! -f "$AGW_DIR/.env" ]]; then
    cat > "$AGW_DIR/.env" << 'EOF'
# AGW Edge Gateway — Environment variables
# Editar con credenciales reales antes de iniciar

AGW_ENV=production
AGW_LOG_LEVEL=INFO
AGW_GATEWAY_ID=AGW-EDGE-01
AGW_CLOUD_API_KEY=your_real_api_key_here
EOF
    chown "$AGW_USER:$AGW_USER" "$AGW_DIR/.env"
    chmod 600 "$AGW_DIR/.env"
    log "  → .env file created at $AGW_DIR/.env — edit before starting"
fi

# ── 7. Systemd service ────────────────────────────────────────────
log "[7/8] Installing systemd service..."
cp "$REPO_DIR/system/systemd/agw-edge.service" /etc/systemd/system/agw-edge.service
systemctl daemon-reload
systemctl enable agw-edge

# ── 8. Configurar IP forwarding (NAT IoT → Internet) ─────────────
log "[8/8] Configuring IP forwarding and NAT..."
bash "$SCRIPT_DIR/setup_ap.sh"

log ""
log "═══════════════════════════════════════════════════════════════"
log "  AGW Edge Gateway setup COMPLETE!"
log "  1. Edit $AGW_DIR/.env with your Cloud API key"
log "  2. Review hostapd.conf WiFi password"
log "  3. Reboot: sudo reboot"
log "═══════════════════════════════════════════════════════════════"
