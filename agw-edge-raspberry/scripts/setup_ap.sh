#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  AGW Edge Gateway — Access Point Setup (wlan1)
#  Configura IP forwarding y NAT para wlan1 → eth0/wlan0
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

log()  { echo -e "\033[0;32m[AP]\033[0m $*"; }
err()  { echo -e "\033[0;31m[ERR]\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && err "Run as root"

# ── Detectar interfaz WAN (eth0 o wlan0) ─────────────────────────
WAN_IFACE="eth0"
if ! ip link show eth0 &>/dev/null; then
    WAN_IFACE="wlan0"
    log "eth0 not found — using wlan0 as WAN"
fi
log "WAN interface: $WAN_IFACE | IoT interface: wlan1"

# ── Habilitar IP forwarding permanente ───────────────────────────
log "Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null

if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# ── Configurar iptables NAT ───────────────────────────────────────
log "Configuring iptables NAT (wlan1 → $WAN_IFACE)..."

# Limpiar reglas existentes del AGW (evitar duplicados)
iptables -t nat -D POSTROUTING -o "$WAN_IFACE" -j MASQUERADE 2>/dev/null || true
iptables -D FORWARD -i wlan1 -o "$WAN_IFACE" -j ACCEPT 2>/dev/null || true
iptables -D FORWARD -i "$WAN_IFACE" -o wlan1 -m state \
    --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || true

# Agregar reglas nuevas
iptables -t nat -A POSTROUTING -o "$WAN_IFACE" -j MASQUERADE
iptables -A FORWARD -i wlan1 -o "$WAN_IFACE" -j ACCEPT
iptables -A FORWARD -i "$WAN_IFACE" -o wlan1 \
    -m state --state RELATED,ESTABLISHED -j ACCEPT

# Persistir reglas
netfilter-persistent save

# ── Unmask y habilitar hostapd ────────────────────────────────────
log "Enabling hostapd service..."
systemctl unmask hostapd
systemctl enable hostapd
systemctl restart hostapd || warn "hostapd restart failed — may need reboot"

# ── Reiniciar dnsmasq ─────────────────────────────────────────────
log "Restarting dnsmasq..."
systemctl enable dnsmasq
systemctl restart dnsmasq

log "Access Point setup complete — wlan1 is now an IoT AP (SSID: AGW_IOT_NET)"
log "Devices on 10.10.0.0/24 will be NATed through $WAN_IFACE"
