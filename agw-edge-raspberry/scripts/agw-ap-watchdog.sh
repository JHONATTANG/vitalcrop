#!/bin/bash
# ============================================================
#  agw-ap-watchdog.sh — Mata estaciones fantasma en el AP
# ============================================================
#  PROBLEMA QUE RESUELVE
#  El chip WiFi integrado de la Raspberry Pi 4 (Broadcom, brcmfmac)
#  gestiona el AP SME en firmware: hostapd arranca con
#  `device_ap_sme=1` y solo puede pedir cosas al driver, no decidir.
#
#  Cuando un nodo desaparece sin desasociarse —reset, corte de luz,
#  perdida de señal— el firmware conserva la entrada de esa estacion
#  en estado [AUTH][ASSOC][AUTHORIZED] con su clave por pares. Al
#  volver, el nuevo 4-way handshake choca con la clave vieja y el
#  firmware rechaza la autenticacion con AUTH_EXPIRE. hostapd ni se
#  entera: el rechazo ocurre por debajo suyo y no aparece en su log.
#
#  El unico modo de limpiarlo sin reiniciar el AP completo es forzar
#  un DEL_STATION hacia el driver, que es lo que hace
#  `hostapd_cli deauthenticate`.
#
#  COMO DETECTA EL FANTASMA
#  Una estacion viva siempre incrementa `rx_packets`: publica
#  telemetria y, aunque no publique, mantiene el keepalive MQTT cada
#  60 s. Una entrada fantasma tiene `tx_packets` creciendo (el AP le
#  habla) y `rx_packets` congelado (nadie responde).
#
#  Se exige que rx_packets no cambie en DOS muestras consecutivas
#  antes de actuar. Con el timer a 45 s eso son ~90 s de silencio
#  real, muy por encima del keepalive MQTT de 60 s, asi que no puede
#  expulsar a un nodo vivo.
# ============================================================

STATE=/run/agw-ap-ghost.state
LOG=/var/log/agw-ap-watchdog.log
UMBRAL=2

command -v hostapd_cli >/dev/null 2>&1 || exit 0
systemctl is-active --quiet hostapd || exit 0

NUEVO=$(mktemp) || exit 1
trap 'rm -f "$NUEVO"' EXIT

# hostapd_cli list_sta imprime una MAC por linea
MACS=$(hostapd_cli list_sta 2>/dev/null | grep -Ei '^([0-9a-f]{2}:){5}[0-9a-f]{2}$')

for MAC in $MACS; do
    RX=$(hostapd_cli sta "$MAC" 2>/dev/null | sed -n 's/^rx_packets=//p' | head -1)
    [ -z "$RX" ] && continue

    PREV_RX=""
    PREV_N=0
    if [ -f "$STATE" ]; then
        LINEA=$(grep -i "^$MAC " "$STATE" 2>/dev/null | head -1)
        PREV_RX=$(echo "$LINEA" | awk '{print $2}')
        PREV_N=$(echo "$LINEA"  | awk '{print $3}')
        [ -z "$PREV_N" ] && PREV_N=0
    fi

    if [ -n "$PREV_RX" ] && [ "$RX" = "$PREV_RX" ]; then
        N=$((PREV_N + 1))
    else
        N=0
    fi

    if [ "$N" -ge "$UMBRAL" ]; then
        TX=$(hostapd_cli sta "$MAC" 2>/dev/null | sed -n 's/^tx_packets=//p' | head -1)
        echo "$(date -Is) fantasma $MAC rx=$RX tx=$TX -> deauthenticate" >> "$LOG"
        hostapd_cli deauthenticate "$MAC" >/dev/null 2>&1
        N=0
    fi

    echo "$MAC $RX $N" >> "$NUEVO"
done

mv -f "$NUEVO" "$STATE" 2>/dev/null
trap - EXIT

# Acotar el log: en un disco de 6.9 GB nada crece sin limite
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then
    tail -500 "$LOG" > "$LOG.tmp" && mv -f "$LOG.tmp" "$LOG"
fi

exit 0
