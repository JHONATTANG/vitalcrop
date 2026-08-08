# Configuración de la Raspberry Pi como Gateway Fog — VitalCrop AGW

> Registro de **lo que quedó aplicado** en la Pi, en orden, con el motivo de cada
> decisión. Sirve para reconstruirla desde cero y como material del documento de
> grado (Fase 2 de la metodología).
>
> Acceso remoto: [`SSH.md`](./SSH.md) · Contexto general: [`../MCD.md`](../MCD.md)
>
> Fecha: 2026-08-02 · Estado: **Fase 2 — AP y broker operativos**

---

## 0. Punto de partida

| Dato | Valor |
|---|---|
| Modelo | Raspberry Pi 4 Model B Rev 1.2 · 4 GB · 64-bit |
| Sistema | Debian 13 (Trixie) · kernel `6.18.34+rpt-rpi-v8` |
| Arranque | USB (`/dev/sda2`), 6.9 GB — **no microSD** |
| Gestor de red | NetworkManager (`dhcpcd` inactivo) |
| Disco al inicio | **89 % usado · 779 MB libres** ← la restricción real |
| RAM al inicio | 385 MiB en uso de 3.7 GiB — nunca fue el problema |

**Conclusión del diagnóstico:** el cuello de botella era el **disco**, no la RAM.
Todo el adelgazamiento se orientó a liberar almacenamiento.

---

## 1. Liberación de disco

### 1.1 Aplicaciones de escritorio

```bash
apt-get purge -y chromium chromium-l10n chromium-common firefox \
  rpi-userguide rpd-wallpaper-trixie rpi-imager pocketsphinx-en-us \
  vlc vlc-l10n realvnc-vnc-server python3-mypy \
  firmware-atheros firmware-mediatek firmware-realtek
apt-get autoremove --purge -y && apt-get clean
```

Arrastró también `thonny`, `mypy` y 74 dependencias. **1.36 GB liberados.**

`firmware-atheros`, `-mediatek` y `-realtek` son firmware de chips WiFi de otros
fabricantes. El WiFi de la Pi 4 es **Broadcom** (`firmware-brcm80211`, conservado).

### 1.2 Entorno gráfico completo

```bash
apt-get purge -y xserver-xorg xserver-xorg-core xserver-xorg-input-all \
  xserver-xorg-input-libinput xserver-xorg-video-all xserver-xorg-video-amdgpu \
  xserver-xorg-video-ati xserver-xorg-video-fbdev xserver-xorg-video-nouveau \
  xserver-xorg-video-radeon lightdm lightdm-gtk-greeter labwc pcmanfm wayvnc \
  autotouch rpd-wallpaper mkvtoolnix libflite1 mesa-vulkan-drivers
apt-get autoremove --purge -y && apt-get clean
```

Arrastró **227 paquetes** por autoremove (`libllvm19`, `mesa-*`, `libopencv-*`,
`plymouth`, `lxpanel`, `openbox`, Qt…). **443 MB liberados.**

La imagen traía `xserver-xorg-video-amdgpu`, `-ati`, `-nouveau` y `-radeon`:
drivers de tarjetas gráficas de PC, inservibles en una Pi.

### 1.3 Swapfile — el caso más engañoso

`/var/swap` ocupaba 817 MB, **no aparecía en `swapon`**, y tras borrarlo volvía a
aparecer en cada arranque, cada vez más grande (1.55 GB → 1.85 GB).

La causa: `/usr/lib/systemd/system-generators/rpi-swap-generator` con
`Mechanism=auto` en `/etc/rpi/swap.conf` elige la estrategia **`zram+file`**, en la
que `/var/swap` es el *writeback* del zram — no swap activo, de ahí que `swapon`
no lo listara.

```bash
cat > /etc/rpi/swap.conf <<'CONF'
[Main]
Mechanism=zram

[Zram]
RamMultiplier=1
MaxSizeMiB=2048
CONF
rm -f /var/swap
```

**~1.8 GB liberados.** Queda solo `zram0` de 2 GB, comprimido **en RAM**: ni ocupa
disco ni desgasta la unidad USB por escrituras.

> ⚠️ El espacio no se libera hasta reiniciar: `losetup -a` mostraba
> `/dev/loop0: (/var/swap (deleted))`. Linux mantiene el inodo mientras haya un
> descriptor abierto.

### 1.4 Journal acotado

```bash
journalctl --vacuum-size=50M
sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=50M/' /etc/systemd/journald.conf
systemctl restart systemd-journald
```

Evita que los logs crezcan sin control en un disco de 6.9 GB.

### 1.5 Kernel ajeno — con una trampa

La imagen traía el kernel de **Raspberry Pi 5** (`rpi-2712`) además del de Pi 4
(`rpi-v8`, el que corre).

Purgar la imagen directamente **instala una versión más nueva**, porque el
metapaquete la exige. Hay que purgar el metapaquete:

```bash
apt-get purge -y linux-image-rpi-2712 linux-headers-rpi-2712 linux-base-rpi-2712 \
  linux-image-6.18.39+rpt-rpi-2712 linux-headers-6.18.39+rpt-rpi-2712 \
  linux-headers-6.18.39+rpt-common-rpi linux-kbuild-6.18.39+rpt \
  linux-base-6.18.39+rpt-rpi-2712
```

**~96 MB liberados.**

---

## 2. Servicios desactivados

```bash
systemctl set-default multi-user.target

for s in lightdm wayvnc wayvnc-control bluetooth avahi-daemon rpcbind \
         nfs-blkmap udisks2 accounts-daemon rpi-eeprom-update \
         cloud-init cloud-init-main cloud-config cloud-final; do
  systemctl disable --now $s
done
```

| Servicio | Por qué se va |
|---|---|
| `lightdm`, `wayvnc*` | Escritorio y VNC. El acceso es por consola |
| `bluetooth` | Sin uso. Ya venía bloqueado por rfkill |
| `avahi-daemon` | mDNS. Se accede por IP fija y Tailscale |
| `rpcbind`, `nfs-blkmap` | Cliente NFS. Sin uso |
| `udisks2` | Automontaje de extraíbles. Sin monitor ni USB |
| `accounts-daemon` | Gestión de cuentas para login gráfico |
| `rpi-eeprom-update` | Comprobación de EEPROM en cada arranque (4.1 s) |
| `cloud-init*` | Provisión de primer arranque. Ya provisionada (11 s) |

**Reversión:** `/root/restore_services.sh` reactiva todo y devuelve
`graphical.target`.

### Intocables

`ssh` · `NetworkManager` · `wpa_supplicant` · `tailscaled` · `dbus` · `polkit` ·
`user@1000` · `cron` · `systemd-*`

> ⚠️ **`wpa_supplicant` parece prescindible al no usar WiFi cliente, pero
> NetworkManager lo necesita para levantar el punto de acceso.**

### Error cometido y corregido

Se desactivó también `NetworkManager-wait-online`, buscando ahorrar 8 s de
arranque. **Dejó la Pi inaccesible en remoto**: los servicios que necesitan red
arrancaban antes de que existiera. Hubo que ir físicamente al equipo.

```bash
systemctl enable --now NetworkManager-wait-online   # revertido
```

**Lección para el documento:** en un gateway al que solo se llega en remoto, la
determinación del orden de arranque vale más que unos segundos de tiempo de boot.

---

## 3. Blindaje de disponibilidad

### 3.1 Watchdog por hardware

Si el kernel se cuelga, el SoC reinicia la Pi a los 15 s sin intervención.

```bash
echo 'dtparam=watchdog=on' >> /boot/firmware/config.txt
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/watchdog.conf <<'CONF'
[Manager]
RuntimeWatchdogSec=15
RebootWatchdogSec=2min
ShutdownWatchdogSec=2min
CONF
```

Verificar: `wdctl` → *Broadcom BCM2835 Watchdog timer · Timeout: 15 seconds*

### 3.2 Sin suspensión, nunca

```bash
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
systemctl restart systemd-logind
```

Un gateway que se duerme deja de aceptar conexiones y arruina las métricas de
disponibilidad de la Fase 6.

### 3.3 Reintentos de red infinitos

```bash
nmcli con mod "Wired connection 1" connection.autoconnect yes
nmcli con mod "Wired connection 1" connection.autoconnect-retries 0
```

### 3.4 Keepalive cada 2 minutos

`/usr/local/bin/agw-keepalive.sh` + `agw-keepalive.timer`. Comprueba conectividad
y el estado de `rpi-connect`; repara si hace falta. Log en
`/var/log/agw-keepalive.log` (vacío = nunca hizo falta actuar).

### 3.5 Tailscale — acceso desde cualquier red

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh
```

IP fija `100.88.237.0`, invariable ante cambios de red o ubicación. Resolvió el
problema real de acceso: **Raspberry Pi Connect tardaba de 10 s a 6 minutos** por
timeouts del *data channel* de WebRTC —fallo de negociación NAT, no de la Pi—.

---

## 4. Punto de acceso WiFi privado

`iw list` confirmó `* AP` entre los modos soportados y región `CO`. `wlan0` estaba
libre, sin perfiles en conflicto.

> ⚠️ **Se probaron dos implementaciones.** La primera con NetworkManager
> (`ipv4.method shared`) falló, y la segunda con hostapd reveló que la causa
> estaba una capa más abajo. El recorrido completo está en §4.4 porque es un
> hallazgo con valor para el documento de grado.

### 4.1 Implementación final: hostapd + dnsmasq

`wlan0` se saca de NetworkManager para que hostapd tenga control exclusivo:

```bash
apt-get install -y hostapd dnsmasq
systemctl unmask hostapd
nmcli con delete agw-hotspot
```

```
# /etc/NetworkManager/conf.d/99-agw-unmanaged-wlan0.conf
[keyfile]
unmanaged-devices=interface-name:wlan0
```

```
# /etc/hostapd/hostapd.conf
interface=wlan0
driver=nl80211
ssid=CULTIVO_INDOOR_WIFI
country_code=CO
hw_mode=g
channel=6
ieee80211n=1
wmm_enabled=1
wpa=2
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
wpa_passphrase=hierbabuena2026
ap_max_inactivity=20
disassoc_low_ack=1
skip_inactivity_poll=0
ctrl_interface=/var/run/hostapd
ctrl_interface_group=0
```

| Parámetro | Motivo técnico |
|---|---|
| `hw_mode=g` + `channel=6` | El ESP32 solo opera en 2.4 GHz |
| `wpa=2` + `rsn_pairwise=CCMP` | WPA2-CCMP puro. Sin WPA3/SAE, que el ESP32 no implementa |
| `country_code=CO` | Cumplimiento regulatorio y potencia máxima permitida (20 dBm en 2.4 GHz) |
| `ieee80211n=1` + `wmm_enabled=1` | 802.11n en lugar de 802.11g: mejor throughput y latencia |
| `ap_max_inactivity=20` | Sondeo de radio cada 20 s de silencio. Es sondeo 802.11, no de datos: un nodo vivo responde aunque publique cada 5 min |
| `disassoc_low_ack=1` | Expulsar estaciones que no responden a los ACK |
| `ctrl_interface` | Habilita `hostapd_cli` — imprescindible para el diagnóstico y para la mitigación de §4.4 |

**Parámetros que NO deben añadirse:** `wpa_pairwise` (redundante con `wpa=2`),
`ieee80211w=0` y `auth_algs=1`. En las pruebas, añadirlos coincidió con fallos de
negociación RSN (`AKMP_INVALID`); los valores por defecto funcionan.

### 4.2 IP fija en `wlan0`

Sin NetworkManager hay que asignarla antes de que arranque hostapd:

```
# /etc/systemd/system/agw-ap-ip.service
[Unit]
Description=AGW - IP fija del punto de acceso (wlan0)
After=sys-subsystem-net-devices-wlan0.device
BindsTo=sys-subsystem-net-devices-wlan0.device
Before=hostapd.service dnsmasq.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/rfkill unblock wlan
ExecStart=/usr/sbin/ip addr flush dev wlan0
ExecStart=/usr/sbin/ip addr add 10.42.0.1/24 dev wlan0
ExecStart=/usr/sbin/ip link set wlan0 up
ExecStop=/usr/sbin/ip addr flush dev wlan0

[Install]
WantedBy=multi-user.target
```

`10.42.0.1` debe coincidir con `MQTT_BROKER` de
`iot-nodes/agw-hydro-node/include/config.h`.

### 4.3 DHCP con reserva por MAC

```
# /etc/dnsmasq.d/agw-ap.conf
interface=wlan0
bind-interfaces
listen-address=10.42.0.1
except-interface=lo
dhcp-range=10.42.0.10,10.42.0.50,255.255.255.0,24h
dhcp-option=option:router,10.42.0.1
dhcp-option=option:dns-server,10.42.0.1
dhcp-host=38:18:2B:8A:12:7C,10.42.0.26,IoT-node-26.001
log-dhcp
```

`bind-interfaces` evita que dnsmasq se cuele en `eth0`. La reserva por MAC fija la
IP del nodo entre reinicios, lo que hace **reproducibles** las medidas de la Fase 6.

**No se configura NAT.** Los nodos reciben `router=10.42.0.1` pero el gateway no
enruta hacia internet: el segmento IoT queda aislado por diseño (§6.6 del MCD).

### 4.4 Hallazgo: el SME en firmware del chip Broadcom

> Esta sección documenta el problema más costoso de la Fase 2 y su mitigación.
> Es material directo para el capítulo de resultados.

**Síntoma.** El nodo ESP32 asociaba correctamente **una sola vez** por cada
arranque del AP. Tras reiniciarse el nodo, todos los intentos posteriores fallaban
con `Reason 2 — AUTH_EXPIRE` de forma indefinida. La única forma de recuperarlo era
reiniciar el punto de acceso completo.

**Falsas pistas descartadas.** El SSID era visible y el RSSI correcto (−50 a
−62 dBm), así que no era cobertura. Un teléfono móvil conectaba sin problema, así
que la contraseña y la configuración WPA2 eran correctas. Se migró de
NetworkManager a hostapd suponiendo una limitación de su modo AP: **el fallo
persistió idéntico**, porque ambos usan el mismo driver por debajo.

**Diagnóstico.** `hostapd -dd` en primer plano mostró que:

```
nl80211: Setup AP(wlan0) - device_ap_sme=1
nl80211: Station flush failed: ret=-14 (Bad address)
RSN: PTK removal from the driver failed
```

`device_ap_sme=1` significa que el **SME (Station Management Entity) del punto de
acceso reside en el firmware del chip Broadcom**, no en hostapd. hostapd solo puede
solicitar operaciones al driver; el firmware decide. Y ahí se ve que tanto el
vaciado de estaciones como la eliminación de la clave por pares le están siendo
**denegados**.

Confirmación definitiva: tras un reinicio del nodo, hostapd **no registraba ningún
intento de asociación**, mientras el ESP32 sí los reportaba. El rechazo ocurría por
debajo de hostapd, en el firmware.

`hostapd_cli all_sta` reveló la entrada residual:

```
38:18:2b:8a:12:7c
flags=[AUTH][ASSOC][AUTHORIZED]     ← el AP cree que sigue conectado
signal=0   capability=0x0   aid=0
rx_packets=31   tx_packets=807      ← el AP habla, nadie responde
hostapdWPAPTKState=11               ← clave por pares ya establecida
```

**Mecanismo.** Cuando el nodo desaparece sin desasociarse —reinicio, corte de
energía, pérdida de señal— el firmware conserva su entrada en estado autorizado con
la clave de sesión antigua. Al volver, el nuevo 4-way handshake usa un nonce nuevo,
colisiona con la clave residual, y el firmware rechaza la autenticación.

**Mitigación.** `hostapd_cli deauthenticate <MAC>` fuerza un `DEL_STATION` hacia el
driver y limpia la entrada del firmware. Se automatizó en
`scripts/agw-ap-watchdog.sh` (instalado en `/usr/local/bin/`), disparado por
`agw-ap-watchdog.timer` cada 45 s.

La detección se basa en la asimetría de tráfico: una estación viva incrementa
`rx_packets` continuamente —publica telemetría y mantiene el keepalive MQTT—,
mientras una entrada fantasma tiene `tx_packets` creciendo y `rx_packets`
congelado. Se exigen **dos muestras consecutivas** sin cambio antes de actuar, para
no expulsar nunca a un nodo vivo.

**Resultado medido:** recuperación automática en **105 s** sin intervención humana.

```
2026-08-02T20:59:29 fantasma 38:18:2b:8a:12:7c rx=31 tx=807 -> deauthenticate
```

**Alcance real del problema.** El fantasma solo aparece cuando el **nodo** se
reinicia y el AP permanece activo. En un corte de energía —el escenario que motiva
el requisito de continuidad— se apagan ambos: hostapd arranca sin estado previo y
el nodo asocia al primer intento. Los casos residuales son reinicio del nodo por
watchdog o salida y retorno de cobertura, donde 105 s de recuperación es tolerable
frente a un período de telemetría de 5 minutos.

**Mejora opcional.** Un dongle WiFi USB con chip Realtek o MediaTek (8-15 USD)
delega el AP SME a `mac80211` en el kernel, donde hostapd tiene control real y la
expulsión por inactividad funciona según especificación. No es necesario para el
prototipo, pero sí recomendable para un despliegue permanente.

### Topología resultante

```
Internet ──eth0 (192.168.20.4, DHCP)──┐
                                      │  RASPBERRY PI
        Tailscale (100.88.237.0) ─────┤  NAT + dnsmasq
                                      │
              wlan0 (10.42.0.1/24, AP)┘
                        │  WPA2-CCMP · canal 6 · 2.4 GHz
                        │  DHCP: NetworkManager/dnsmasq
                   ┌────┴────┬─────────┐
                 ESP32     ESP32      ESP32-N
```

Los nodos **no alcanzan internet directamente**: toda la telemetría atraviesa el
gateway. Es la definición de la arquitectura Fog, y permite medir el segmento
inalámbrico de forma controlada.

### Verificación

```bash
ip -4 addr show wlan0 | grep inet          # 10.42.0.1/24
iw dev wlan0 info | grep -E "ssid|type|channel"
ss -ulnp | grep :67                        # dnsmasq sirviendo DHCP
```

---

## 5. Broker MQTT — Mosquitto

```bash
apt-get install -y mosquitto mosquitto-clients
```

`/etc/mosquitto/mosquitto.conf` (base de Debian, **no se toca**) ya define
`persistence`, `persistence_location`, `log_dest` e `include_dir`.

```bash
cat > /etc/mosquitto/conf.d/agw.conf <<'CONF'
listener 1883
allow_anonymous true
autosave_interval 60
sys_interval 10
max_queued_messages 10000
max_packet_size 8192
CONF
```

> ⚠️ **Mosquitto 2.x aborta ante directivas duplicadas**, no las ignora. Repetir
> `persistence_location` en `conf.d/` impide arrancar el broker con
> `Duplicate persistence_location value in configuration`. El archivo de `conf.d/`
> debe contener **solo lo que no está en la base**.

| Directiva | Motivo |
|---|---|
| `listener 1883` | Puerto del contrato. `config.h` del ESP32 apunta ahí |
| `allow_anonymous true` | Fases 2-5. El segmento `wlan0` está aislado. Se activa autenticación en Fase 6 |
| `sys_interval 10` | Publica `$SYS/broker/*` cada 10 s: **fuente de métricas** de la Fase 6 (clientes conectados, mensajes enviados/recibidos, bytes) |
| `max_queued_messages 10000` | Si el servicio del edge se cae, no se pierden mensajes QoS 1 |
| `max_packet_size 8192` | Sustituye al obsoleto `message_size_limit` |
| `autosave_interval 60` | Volcado de persistencia cada minuto |

### Reinicio automático

```bash
mkdir -p /etc/systemd/system/mosquitto.service.d
cat > /etc/systemd/system/mosquitto.service.d/restart.conf <<'CONF'
[Unit]
After=network-online.target
Wants=network-online.target

[Service]
Restart=always
RestartSec=5
CONF
systemctl daemon-reload
systemctl enable mosquitto
```

### Verificación del contrato

```bash
mosquitto_sub -h 10.42.0.1 -t 'cultivo/#' -v -C 1 &
sleep 2
mosquitto_pub -h 10.42.0.1 -t 'cultivo/indoor/hierbabuena/telemetria' \
  -m '{"id":"IoT-node-26.001","fw":"1.1.0","uptime":1000,"rssi":-55,"periodo_ms":300000,"sensores":{"temp":24.5,"hum":65,"hsuelo":72}}'
wait
```

✅ Resultado: el mensaje se recibió íntegro en el topic canónico.

### Espiar el broker desde el PC

Por Tailscale, sin estar en la red del cultivo:

```powershell
mosquitto_sub -h 100.88.237.0 -t "cultivo/#" -v
```

---

## 6. Resultados medidos

| Métrica | Antes | Después | Mejora |
|---|---|---|---|
| Disco usado | 89 % (779 MB libres) | **51 % (3.3 GB libres)** | +2.5 GB |
| RAM en uso | 385 MiB | **215 MiB** | −44 % |
| Arranque total | 63.6 s | **29.4 s** | −54 % |
| — kernel | 20.2 s | 6.9 s | |
| — userspace | 43.4 s | 22.5 s | |
| Servicios corriendo | 23 | 12 | −48 % |
| Temperatura | 39.4 °C | ~40 °C | estable |
| Throttling | `0x0` | `0x0` | sano |
| Reconexión tras reinicio | 3-6 min (Pi Connect) | **inmediata** (Tailscale) | |

---

## 7. Pendiente de la Fase 2

- [ ] `apt upgrade` — 103 paquetes pendientes (ya hay espacio)
- [ ] Realinear el contrato MQTT del edge controller (MCD deuda 7.1):
      `agw/node/+/*` :1884 → `cultivo/indoor/hierbabuena/*` :1883
- [ ] Desplegar `edge_controller` en `/opt/agw-edge` con su `.env`
- [ ] Servicio systemd del gateway con `Restart=always`
- [ ] Buffer SQLite en `/var/lib/agw/buffer.db`

## 8. Criterio de aceptación de la Fase 2 — VERIFICADO

> Se corta la energía, se restablece, y en **< 90 s** el AP está levantado,
> Mosquitto escuchando en `:1883` y el servicio del edge suscrito — sin
> intervención manual.

Prueba ejecutada con `reboot` completo el 2026-08-02:

```
up 1 min
agw-ap-ip / hostapd / dnsmasq / mosquitto  →  active
wlan0    10.42.0.1/24
ssid     CULTIVO_INDOOR_WIFI · type AP · canal 6
:1883    escuchando
ESP32    asociado en segundos
```

✅ **Cumplido** para AP y broker. Pendiente el servicio del edge.

**Hallazgo:** el retardo de 105 s por estación fantasma (§4.4) **no se manifiesta en
el corte de energía**. Al reiniciarse la Raspberry, hostapd arranca sin estado
previo y el nodo asocia al primer intento. El peor caso teórico y el peor caso
operativo no coinciden — una distinción que debe explicitarse al reportar
disponibilidad en la Fase 6.

## 9. Notas de operación

### `hostapd_cli` requiere root

`ctrl_interface_group=0` deja la interfaz de control en el grupo root:

```bash
sudo hostapd_cli list_sta
sudo hostapd_cli sta <MAC> | grep -E "rx_packets|tx_packets|signal|connected_time"
sudo hostapd_cli deauthenticate <MAC>
```

El vigilante no se ve afectado: corre como root vía systemd.

### Servicios habilitados al arranque

```bash
systemctl is-enabled agw-ap-ip hostapd dnsmasq mosquitto \
                     agw-ap-watchdog.timer agw-keepalive.timer tailscaled ssh
```

### Ver telemetría en vivo

```bash
mosquitto_sub -h 10.42.0.1 -t 'cultivo/#' -v
```

### Controlar el nodo

```bash
# HTTP (independiente de MQTT)
curl -s http://10.42.0.26/estado
curl -X POST "http://10.42.0.26/modulo?modulo=simulacion&activo=true"

# MQTT
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_modulo","modulo":"telemetria","activo":true}'
```

Módulos: `telemetria` · `status` · `alertas` · `sensor_hdc` · `sensor_suelo` ·
`sensor_ph` · `actuadores` · `simulacion`
