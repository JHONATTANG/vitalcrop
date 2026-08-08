# FASE 1 — Diagnóstico de la Raspberry Pi

> **Objetivo:** conocer exactamente qué hardware, qué sistema y qué procesos hay
> antes de modificar nada. La Fase 2 (adelgazar el sistema, levantar el AP y el
> broker) está **bloqueada** hasta tener esta información.
>
> ⚠️ **Todos los comandos de este documento son de SOLO LECTURA.** Ninguno instala,
> desinstala, detiene ni modifica nada. Se pueden ejecutar con total seguridad.

**Contexto de conexión:** Raspberry conectada por Ethernet, acceso por consola vía
Raspberry Pi Connect.

---

## 🚀 Opción A — Un solo comando (recomendado)

Pega esto completo en la consola de la Raspberry. Genera un informe en
`~/agw_diagnostico.txt` y lo imprime en pantalla.

```bash
cat > /tmp/agw_diag.sh <<'EOF'
#!/usr/bin/env bash
# Diagnóstico VitalCrop AGW — SOLO LECTURA
OUT=~/agw_diagnostico.txt
exec > >(tee "$OUT") 2>&1

s(){ printf '\n\n═══ %s ═══\n' "$1"; }

s "0. FECHA Y HOSTNAME"
date; hostname; uptime

s "1. MODELO DE HARDWARE"
cat /proc/device-tree/model 2>/dev/null; echo
cat /proc/cpuinfo | grep -E 'Model|Revision|Serial|Hardware' 2>/dev/null
echo "--- Revisión decodificada ---"
grep -m1 Revision /proc/cpuinfo

s "2. CPU"
lscpu 2>/dev/null | grep -E 'Architecture|Byte Order|CPU\(s\)|Model name|CPU max|CPU min|BogoMIPS'
echo "--- Frecuencia actual ---"
vcgencmd measure_clock arm 2>/dev/null || cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null

s "3. MEMORIA RAM"
free -h
echo "--- Detalle ---"
grep -E 'MemTotal|MemFree|MemAvailable|SwapTotal|SwapFree' /proc/meminfo
echo "--- Swap configurado ---"
swapon --show 2>/dev/null
cat /etc/dphys-swapfile 2>/dev/null | grep -v '^#' | grep -v '^$'
echo "--- Split de memoria GPU ---"
vcgencmd get_mem arm 2>/dev/null; vcgencmd get_mem gpu 2>/dev/null

s "4. ALMACENAMIENTO"
df -h
echo "--- Dispositivos de bloque ---"
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT,MODEL 2>/dev/null
echo "--- Los 20 directorios más pesados en / ---"
sudo du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -20
echo "--- Tamaño de logs ---"
sudo du -sh /var/log 2>/dev/null
sudo journalctl --disk-usage 2>/dev/null
echo "--- Caché de apt ---"
sudo du -sh /var/cache/apt 2>/dev/null

s "5. SISTEMA OPERATIVO"
cat /etc/os-release
echo "--- Kernel y arquitectura ---"
uname -a
dpkg --print-architecture
echo "--- ¿64 bits? ---"
getconf LONG_BIT
echo "--- Firmware ---"
vcgencmd version 2>/dev/null

s "6. TEMPERATURA Y THROTTLING"
vcgencmd measure_temp 2>/dev/null
cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{print $1/1000" C"}'
echo "--- get_throttled (0x0 = sin problemas de alimentación) ---"
vcgencmd get_throttled 2>/dev/null
echo "--- Voltaje ---"
vcgencmd measure_volts core 2>/dev/null

s "7. RED — INTERFACES"
ip -br addr
echo "--- Rutas ---"
ip route
echo "--- DNS ---"
cat /etc/resolv.conf 2>/dev/null | grep -v '^#'
echo "--- Gestor de red en uso ---"
systemctl is-active NetworkManager dhcpcd systemd-networkd wpa_supplicant 2>/dev/null
echo "--- ¿Existe dhcpcd.conf? ---"
ls -la /etc/dhcpcd.conf 2>/dev/null || echo "no existe (probablemente NetworkManager)"

s "8. WIFI — CAPACIDAD DE ACCESS POINT"
echo "--- Interfaces inalámbricas ---"
iw dev 2>/dev/null || echo "iw no instalado"
echo "--- Chip WiFi ---"
lsusb 2>/dev/null | grep -i -E 'wireless|wifi|802.11'
dmesg 2>/dev/null | grep -i -E 'brcmfmac|cfg80211|wlan' | tail -10
echo "--- ¿Soporta modo AP? (buscar 'AP' en Supported interface modes) ---"
iw list 2>/dev/null | grep -A 12 'Supported interface modes'
echo "--- ¿WiFi bloqueado por rfkill? ---"
rfkill list 2>/dev/null
echo "--- País regulatorio (necesario para AP) ---"
iw reg get 2>/dev/null | head -5

s "9. SERVICIOS ACTIVOS (systemd)"
systemctl list-units --type=service --state=running --no-pager --no-legend
echo ""
echo "--- Total de servicios corriendo ---"
systemctl list-units --type=service --state=running --no-pager --no-legend | wc -l

s "10. SERVICIOS HABILITADOS AL ARRANQUE"
systemctl list-unit-files --type=service --state=enabled --no-pager --no-legend

s "11. TIMERS ACTIVOS"
systemctl list-timers --all --no-pager

s "12. CONSUMO — TOP 15 POR RAM"
ps -eo pid,ppid,user,%mem,%cpu,rss,comm --sort=-%mem | head -16

s "13. CONSUMO — TOP 15 POR CPU"
ps -eo pid,ppid,user,%mem,%cpu,rss,comm --sort=-%cpu | head -16

s "14. ENTORNO GRÁFICO"
echo "--- Target por defecto (graphical.target = arranca escritorio) ---"
systemctl get-default
echo "--- ¿Hay servidor X / Wayland corriendo? ---"
pgrep -a -f 'Xorg|wayfire|labwc|lightdm|gdm|xdg' 2>/dev/null || echo "ninguno corriendo"
echo "--- Paquetes de escritorio instalados ---"
dpkg -l 2>/dev/null | grep -E 'lightdm|xserver-xorg|wayfire|labwc|raspberrypi-ui-mods|lxde|pcmanfm' | awk '{print $2, $3}'

s "15. PUERTOS EN ESCUCHA"
sudo ss -tulpn 2>/dev/null || sudo netstat -tulpn 2>/dev/null

s "16. SOFTWARE RELEVANTE YA INSTALADO"
for p in python3 pip3 mosquitto mosquitto_sub hostapd dnsmasq sqlite3 git docker chrony ntpd; do
  printf '%-16s ' "$p"; command -v "$p" >/dev/null 2>&1 && command -v "$p" || echo "NO INSTALADO"
done
echo "--- Versión de Python ---"
python3 --version 2>/dev/null
echo "--- Paquetes Python relevantes ---"
pip3 list 2>/dev/null | grep -i -E 'paho|mqtt|requests|aiohttp|structlog|yaml|httpx' || echo "ninguno / pip3 no disponible"
echo "--- Mosquitto ---"
mosquitto -h 2>/dev/null | head -2
systemctl is-enabled mosquitto 2>/dev/null; systemctl is-active mosquitto 2>/dev/null

s "17. USUARIOS Y RUTAS"
whoami; id
echo "--- HOME ---"
echo $HOME; ls -la $HOME | head -20
echo "--- ¿Existe algo de VitalCrop ya? ---"
ls -la $HOME 2>/dev/null | grep -i -E 'agw|vital|crop|edge' || echo "nada previo"

s "18. ARRANQUE — TIEMPO Y SERVICIOS MÁS LENTOS"
systemd-analyze 2>/dev/null
echo "--- Top 15 más lentos al arrancar ---"
systemd-analyze blame --no-pager 2>/dev/null | head -15

s "19. RASPBERRY PI CONNECT"
systemctl --user is-active rpi-connect 2>/dev/null || systemctl is-active rpi-connect 2>/dev/null || echo "no detectado como servicio"
rpi-connect status 2>/dev/null

s "20. CONFIGURACIÓN DE ARRANQUE"
cat /boot/firmware/config.txt 2>/dev/null | grep -v '^#' | grep -v '^$' || cat /boot/config.txt 2>/dev/null | grep -v '^#' | grep -v '^$'
echo "--- cmdline ---"
cat /boot/firmware/cmdline.txt 2>/dev/null || cat /boot/cmdline.txt 2>/dev/null

s "FIN DEL DIAGNÓSTICO"
echo "Informe guardado en: $OUT"
EOF
chmod +x /tmp/agw_diag.sh && bash /tmp/agw_diag.sh
```

Después:

```bash
# Ver el informe completo
cat ~/agw_diagnostico.txt

# O su tamaño, para saber si conviene partirlo
wc -l ~/agw_diagnostico.txt
```

**Pega el contenido de `~/agw_diagnostico.txt` en el chat.** Si es muy largo, pégalo
por bloques (los bloques 1-8 son los más críticos para desbloquear la Fase 2).

---

## 🔍 Opción B — Bloque por bloque

Si prefieres ir viendo resultado por resultado, o si el script falla en algún punto.

### 1. Hardware

```bash
cat /proc/device-tree/model; echo
grep -E 'Model|Revision|Hardware' /proc/cpuinfo
lscpu | grep -E 'Architecture|CPU\(s\)|Model name|CPU max'
getconf LONG_BIT
```
**Por qué importa:** una Pi 3 con 1 GB no soporta el mismo plan que una Pi 4 con 4 GB.
Y `getconf LONG_BIT` decide si podemos usar binarios de 64 bits.

### 2. Memoria

```bash
free -h
swapon --show
vcgencmd get_mem gpu
```
**Por qué importa:** el broker + servicio Python + SQLite consumen poco (~80-150 MB),
pero si hay escritorio corriendo puede haber 400 MB desperdiciados. `get_mem gpu`
dice cuánta RAM se le regaló a la GPU — si no hay pantalla, es RAM recuperable.

### 3. Almacenamiento

```bash
df -h
sudo du -xh --max-depth=2 / 2>/dev/null | sort -rh | head -20
sudo journalctl --disk-usage
sudo du -sh /var/cache/apt /var/log
```
**Por qué importa:** el buffer SQLite crece con el tiempo. Necesitamos saber cuánto
espacio libre real hay y cuánto están ocupando logs y caché (típicamente 1-3 GB
recuperables).

### 4. Sistema operativo

```bash
cat /etc/os-release
uname -a
dpkg --print-architecture
```
**Por qué importa:** Bookworm usa NetworkManager y `nmcli` para el AP; Bullseye y
anteriores usan `dhcpcd` + `hostapd` + `dnsmasq`. **Los scripts de la Fase 2 son
distintos según cuál sea.** Este es el dato más importante de todo el diagnóstico.

### 5. Salud eléctrica y térmica

```bash
vcgencmd measure_temp
vcgencmd get_throttled
vcgencmd measure_volts core
```
**Por qué importa:** `get_throttled` distinto de `0x0` significa que la fuente de
alimentación es insuficiente o hay sobrecalentamiento. Un gateway que se estrangula
arruina las métricas de disponibilidad de la Fase 6. Hay que saberlo ahora, no después.

### 6. Red

```bash
ip -br addr
ip route
systemctl is-active NetworkManager dhcpcd systemd-networkd
ls -la /etc/dhcpcd.conf
```
**Por qué importa:** confirma que `eth0` es el uplink y que `wlan0` está libre para
el AP. Y define qué gestor de red vamos a configurar.

### 7. Capacidad de Access Point ⚠️ CRÍTICO

```bash
iw dev
iw list | grep -A 12 'Supported interface modes'
rfkill list
iw reg get | head -5
```
**Por qué importa:** **si el chip WiFi no soporta modo `AP`, toda la Fase 2 cambia**
(habría que usar un dongle USB o poner el ESP32 en la red del router). Busca la
palabra `AP` en la lista de modos soportados. Si `rfkill` muestra `Soft blocked: yes`,
el WiFi está desactivado y hay que habilitarlo. Si el país regulatorio es `00`
(desconocido), hostapd puede negarse a arrancar.

### 8. Servicios y consumo

```bash
systemctl list-units --type=service --state=running --no-pager --no-legend
ps -eo pid,user,%mem,%cpu,rss,comm --sort=-%mem | head -16
systemctl get-default
systemd-analyze blame --no-pager | head -15
```
**Por qué importa:** es la lista de candidatos a desactivar en la Fase 2. No vamos a
desactivar nada a ciegas: primero se ve qué hay, luego se decide con criterio, y
siempre con un script de reversión.

### 9. Software ya instalado

```bash
command -v python3 pip3 mosquitto hostapd dnsmasq sqlite3 git
python3 --version
pip3 list 2>/dev/null | grep -i -E 'paho|mqtt|requests|yaml'
systemctl is-active mosquitto
```
**Por qué importa:** evita reinstalar lo que ya está y detecta si hay una instalación
previa a medias.

### 10. Puertos ocupados

```bash
sudo ss -tulpn
```
**Por qué importa:** si algo ya escucha en el 1883 o el 8080, hay que resolverlo
antes de levantar el broker.

---

## 📋 Plantilla de resultados

Rellena esto (o deja que el agente lo rellene con tu salida) y se copia a `MCD.md` §11.

```
### Perfil de la Raspberry Pi — <fecha>

Modelo ................. 
Revisión ............... 
CPU .................... 
Arquitectura ........... (32 / 64 bit)
RAM total .............. 
RAM disponible ......... 
GPU mem split .......... 
Swap ................... 

Almacenamiento total ... 
Espacio libre .......... 
Logs (journal) ......... 
Caché apt .............. 
Recuperable estimado ... 

SO ..................... (Bookworm / Bullseye / otro)
Kernel ................. 
Gestor de red .......... (NetworkManager / dhcpcd / systemd-networkd)

Temperatura ............ 
get_throttled .......... (0x0 esperado)
Voltaje core ........... 

eth0 ................... IP / estado
wlan0 .................. IP / estado
Chip WiFi .............. 
¿Soporta modo AP? ...... SÍ / NO      ← CRÍTICO
rfkill ................. 
País regulatorio ....... 

Target por defecto ..... (graphical / multi-user)
Escritorio instalado ... SÍ / NO
Servicios corriendo .... (cantidad)
Tiempo de arranque ..... 

Python3 ................ 
pip3 ................... 
paho-mqtt .............. 
Mosquitto .............. instalado / activo / no
hostapd ................ 
dnsmasq ................ 
git .................... 

Puertos en escucha ..... 
Raspberry Pi Connect ... 

Candidatos a desactivar (Fase 2):
  - 
  - 
```

---

## ➡️ Qué pasa después

Con esta información el agente va a:

1. Llenar `MCD.md` §11 con el perfil real.
2. Determinar la ruta de configuración de red correcta (NetworkManager vs
   hostapd+dnsmasq) — depende del punto 4 y 7.
3. Elaborar la **lista concreta de servicios a desactivar**, con justificación uno
   por uno y su comando de reversión, en `scripts/slim_system.sh` +
   `scripts/restore_services.sh`.
4. Dimensionar el buffer SQLite según el espacio libre real.
5. Empezar la Fase 2.

**Si algún comando falla**, no pasa nada: pega el error junto con el resto. Varios
comandos (`vcgencmd`, `iw`, `rpi-connect`) solo existen en ciertas configuraciones y
su ausencia también es información útil.
