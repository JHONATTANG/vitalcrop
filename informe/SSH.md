# SSH y acceso remoto a la Raspberry Pi — VitalCrop AGW

> **Para qué es este documento:** no volver a quedarte sin acceso a la Pi.
> Aquí están las tres vías de entrada, cómo usarlas desde Windows, y qué hacer
> cuando alguna falle.
>
> Última actualización: 2026-08-02

---

## 1. Datos del equipo

| Dato | Valor |
|---|---|
| Hostname | `rasp-jh` |
| Usuario | `rasp-jh` |
| Modelo | Raspberry Pi 4 Model B Rev 1.2 · 4 GB · 64-bit |
| Sistema | Debian 13 (Trixie) · kernel `6.18.34+rpt-rpi-v8` |
| **IP Tailscale (desde cualquier parte)** | **`100.88.237.0`** |
| IP LAN (solo en casa) | `192.168.20.4` — por DHCP, puede cambiar |
| MAC de `eth0` | `dc:a6:32:90:de:f1` |
| Cuenta Tailscale | `jhonattan.gonzalez.38@` |
| PC Windows en el tailnet | `jht2g` → `100.100.17.21` |

---

## 2. Las tres vías de acceso

Están ordenadas por fiabilidad. Empieza siempre por la primera.

| # | Vía | Desde dónde | Velocidad | Depende de |
|---|---|---|---|---|
| 1 | **Tailscale + SSH** | Cualquier red del mundo | Instantánea | Servicio Tailscale |
| 2 | **SSH por LAN** | Solo en la misma red | Instantánea | Nada externo |
| 3 | **Raspberry Pi Connect** | Cualquier red del mundo | 10 s – 6 min | Relay WebRTC |

Tener tres es deliberado: si una cae, quedan dos.

---

## 3. Vía 1 — Tailscale (la principal)

### Qué es

Una VPN tipo malla sobre WireGuard. La Pi y tu PC entran con la misma cuenta y
se ven entre sí como si estuvieran en la misma LAN, estés donde estés. Atraviesa
el NAT sin abrir puertos en el router.

La IP `100.88.237.0` **no cambia nunca**: ni al mudarte, ni al cambiar de router,
ni al llevarte la Pi a otro país.

### Conectarte desde Windows

Abre **PowerShell** (no hace falta administrador):

```powershell
ssh rasp-jh@100.88.237.0
```

Ya está. Windows 10/11 trae cliente OpenSSH incorporado.

Si prefieres no memorizar la IP, crea `C:\Users\JhtG2\.ssh\config` con:

```
Host pi
    HostName 100.88.237.0
    User rasp-jh
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

Y a partir de entonces basta con:

```powershell
ssh pi
```

`ServerAliveInterval` evita que la sesión se congele si la red parpadea.

### Autenticación

La Pi tiene Tailscale SSH activado (`tailscale up --ssh`). Eso significa que la
identidad de tu cuenta de Tailscale es la credencial — normalmente no pide
contraseña. La primera vez puede abrirte el navegador para confirmar.

Si te pide contraseña, es la de `rasp-jh`, y también es válido: el `sshd` normal
sigue escuchando.

### Comprobar el estado

En la Pi:

```bash
tailscale status
tailscale ip -4
systemctl is-enabled tailscaled     # debe decir: enabled
```

En Windows: icono de Tailscale en la bandeja del sistema (junto al reloj). Ahí
ves los equipos conectados y puedes copiar sus IPs.

### Añadir el móvil

Instala Tailscale desde Play Store / App Store, entra con la misma cuenta, y
tendrás acceso a la Pi desde el teléfono con cualquier app de SSH (Termius,
JuiceSSH).

---

## 4. Vía 2 — SSH por LAN (respaldo local)

Solo funciona si estás conectado a la misma red que la Pi.

```powershell
ssh rasp-jh@192.168.20.4
```

⚠️ Esa IP la asigna el router por DHCP y **puede cambiar**. Si algún día falla,
busca la nueva IP en la lista de dispositivos del router, o desde la Pi con
`ip -br addr`.

### Opcional: fijar la IP

Si algún día quieres que sea fija, hay dos formas:

**a) En el router** (lo más limpio) — entra a su web, busca *DHCP Reservation* /
*Static Lease*, y ata la MAC `dc:a6:32:90:de:f1` a `192.168.20.4`.

**b) En la Pi** — solo si la IP está fuera del rango DHCP del router, si no habrá
conflicto:

```bash
nmcli con mod "Wired connection 1" ipv4.method manual \
  ipv4.addresses 192.168.20.4/24 ipv4.gateway 192.168.20.1 \
  ipv4.dns "1.1.1.1,8.8.8.8"
nmcli con up "Wired connection 1"
```

Con Tailscale funcionando esto es opcional. No es urgente.

---

## 5. Vía 3 — Raspberry Pi Connect (último recurso)

Web: [connect.raspberrypi.com](https://connect.raspberrypi.com) → tu equipo → *Shell*

Funciona desde cualquier parte, pero **puede tardar de 10 segundos a 6 minutos**.
La causa está diagnosticada: usa WebRTC y a veces falla la apertura del canal de
datos. En el journal se ve así:

```
ERRO Failed accepting connection reason="accept connect: Timeout opening data channel"
```

**No es un fallo de la Pi.** El servicio está corriendo desde el arranque; lo que
falla es la negociación NAT entre tu navegador y la Pi. Reiniciar el servicio no
ayuda — solo hay que esperar, o usar Tailscale.

Solo tiene **consola remota**. El *compartir pantalla* ya no funciona porque se
desinstaló `wayvnc` junto con el escritorio (ver §8).

### Comprobar su estado

⚠️ **Debe ejecutarse como `rasp-jh`, NO con `sudo su`.** Es un servicio de
usuario; si lo consultas como root te dirá "not running" aunque esté funcionando.

```bash
rpi-connect status
loginctl show-user rasp-jh -p Linger      # debe decir: Linger=yes
```

El `Linger=yes` es lo que permite que sobreviva sin sesión gráfica. No lo quites.

---

## 6. Blindaje automático instalado

Tres capas que trabajan solas para que la Pi no quede inaccesible.

### Watchdog por hardware

Si el kernel se cuelga, la Pi se reinicia sola a los 15 segundos.

```bash
wdctl                    # Broadcom BCM2835 · Timeout: 15 seconds
```

Configurado en `/boot/firmware/config.txt` (`dtparam=watchdog=on`) y
`/etc/systemd/system.conf.d/watchdog.conf`.

### Keepalive cada 2 minutos

`/usr/local/bin/agw-keepalive.sh` comprueba conectividad y el estado de
`rpi-connect`, y los repara si hace falta.

```bash
systemctl list-timers agw-keepalive --no-pager
cat /var/log/agw-keepalive.log          # vacío = nunca hizo falta actuar
```

### Reintentos infinitos de red

```bash
nmcli con show "Wired connection 1" | grep autoconnect
```

`connection.autoconnect-retries = 0` significa reintentar para siempre.

---

## 7. Si no puedes entrar de ninguna forma

En orden, de menos a más invasivo:

1. **Prueba las tres vías.** Tailscale primero, luego LAN, luego Pi Connect.
2. **Espera 5 minutos.** Si acabas de reiniciar, Pi Connect puede tardar.
3. **Comprueba desde otro dispositivo** con Tailscale (el móvil sirve).
4. **Mira si la Pi está viva:** ¿led encendido? ¿responde a `ping 192.168.20.4`
   desde la misma red?
5. **Ciclo de energía.** Desenchufa, espera 10 s, enchufa. Espera 2-3 minutos.
6. **Monitor + teclado por HDMI.** Arranca en modo consola (`multi-user.target`),
   verás un login de texto. Entra con `rasp-jh` y su contraseña.
7. **Sacar la unidad USB** y montarla en otro equipo Linux para editar archivos.

### Deshacer el adelgazamiento

Si sospechas que algo de lo desactivado es la causa, en la Pi:

```bash
sudo /root/restore_services.sh
sudo reboot
```

Eso reactiva escritorio, Bluetooth, avahi, NFS, cloud-init y todo lo demás.

---

## 8. Qué se cambió en la Pi (resumen)

Contexto para entender por qué algo ya no está.

### Liberado en disco: 89% → ~70% usado

| Acción | Recuperado |
|---|---|
| Purga de chromium, firefox, VLC, thonny, rpi-imager, firmware de otros chips | 1.36 GB |
| Purga del escritorio (Xorg, lightdm, labwc, wayvnc, mesa, llvm…) y 227 dependencias | 443 MB |
| Swapfile `/var/swap` desactivado (`Mechanism=zram` en `/etc/rpi/swap.conf`) | ~1.8 GB |
| Journal limitado a 50 MB | — |

### Servicios desactivados

`lightdm` · `wayvnc` · `wayvnc-control` · `bluetooth` · `avahi-daemon` ·
`rpcbind` · `nfs-blkmap` · `udisks2` · `accounts-daemon` · `rpi-eeprom-update` ·
`cloud-init` y derivados

Arranque por defecto cambiado a `multi-user.target` (consola, sin escritorio).

**Resultado:** arranque de 63.6 s → ~30 s · RAM en uso de 385 MB → ~200 MB.

### Intactos (no tocar nunca)

`ssh` · `NetworkManager` · `wpa_supplicant` · `tailscaled` · `dbus` · `polkit` ·
`user@1000` (sostiene `rpi-connect`) · `cron` · `systemd-*`

> `wpa_supplicant` parece prescindible porque no usas WiFi cliente, pero
> **NetworkManager lo necesita para levantar el punto de acceso**. Déjalo.

---

## 9. Comandos de diagnóstico rápido

```bash
# Salud general
df -h /; free -h; vcgencmd measure_temp; vcgencmd get_throttled

# Accesos vivos
systemctl is-active ssh NetworkManager tailscaled
tailscale status
rpi-connect status        # como rasp-jh, sin sudo

# Red
ip -br addr; nmcli connection show

# Arranque
systemd-analyze; systemd-analyze blame --no-pager | head -10

# Watchdog
wdctl | head -4
```

**Valores sanos de referencia:** `get_throttled` = `0x0` · temperatura < 60 °C ·
arranque < 40 s · RAM en uso < 400 MB.
