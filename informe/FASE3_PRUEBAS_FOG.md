# Fase 3 — Validación de la capa Fog (ESP32 + Raspberry Pi)

> **Qué se valida aquí.** Que el cultivo sobrevive sin internet. Toda esta fase
> corre con `AGW_CLOUD_ENABLED=false`: la nube está deliberadamente apagada.
> Si el sistema funciona en estas condiciones, funcionará con internet — lo
> contrario no es cierto.
>
> Ejecutar desde `ssh rasp-jh@100.88.237.0`, con el monitor serie del ESP32
> abierto en paralelo.

---

## Estado de partida verificado

| Elemento | Evidencia |
|---|---|
| ESP32 asociado al AP | `IP=10.42.0.26 GW=10.42.0.1 RSSI=-59 dBm canal=6 ahorro=ON` |
| Telemetría publicando | Cada 10 s, `[OK]` |
| Heartbeat | Cada 60 s |
| Edge suscrito | `[agw.broker] MQTT subscribed pattern=cultivo/indoor/hierbabuena/#` |
| Edge procesando | `[agw.handler] Telemetria node=IoT-node-26.001` |
| Buffer local | 124 registros persistidos en `/var/lib/agw/buffer.db` |
| Sensores ausentes | `"sensores":{}` → el edge los lee como `None` y no evalúa reglas |

---

## T1 — Lazo de decisión autónoma (la prueba central)

**Qué demuestra:** que la Raspberry decide y el nodo obedece, sin intervención
humana y sin internet. Es la definición operativa de Fog Computing.

### Preparación

Terminal A — observar el tráfico MQTT en bruto:

```bash
mosquitto_sub -h 10.42.0.1 -t 'cultivo/#' -v
```

Terminal B — observar el razonamiento del edge:

```bash
sudo journalctl -u agw-edge -f | grep -E "Telemetria|Rule triggered|Comando enviado|Alerta"
```

### Ejecución

Encender la simulación de sensores en el nodo:

```bash
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_modulo","modulo":"simulacion","activo":true}'
```

### Qué debe ocurrir

1. La telemetría pasa de `"sensores":{}` a valores que se mueven
   (temp 18-30 °C, hum 45-80 %, hsuelo 25-92 %).
2. El edge empieza a evaluar reglas con datos reales.
3. Cuando `hsuelo` baje de 30 %, el edge publica **por su cuenta**:
   `{"cmd":"set_riego","encendido":true}` en el topic de comandos.
4. El ESP32 lo recibe y responde en el monitor serie:
   `[MQTT-CMD] Riego forzado: ON`.
5. Cuando `hsuelo` supere 90 %, el edge publica `set_riego:false`.

### Criterio de aceptación

- [ ] La decisión de riego la toma la Raspberry, no un humano
- [ ] El comando llega al ESP32 y este lo ejecuta
- [ ] El comando **no se repite** mientras la condición se mantiene
- [ ] El comando contrario **sí sale de inmediato** al invertirse la condición

> El último punto es deliberado. La deduplicación tiene ventana de 300 s, pero
> es **por contenido**: cortar el riego nunca debe esperar cinco minutos.

---

## T2 — Persistencia y cadencia del buffer

**Qué demuestra:** que ningún dato se pierde aunque no haya nube.

```bash
sudo sqlite3 /var/lib/agw/buffer.db \
  "SELECT COUNT(*) total, SUM(synced=0) pendientes FROM telemetry_buffer;"
```

Esperar 5 minutos y repetir. Con período de 10 s deben aparecer ~30 registros más.

Verificar que el timestamp lo estampa la Raspberry y no el nodo:

```bash
sudo sqlite3 /var/lib/agw/buffer.db \
  "SELECT datetime(timestamp,'unixepoch','localtime'), node_id,
          json_extract(payload,'\$.sensores.temp')   AS temp,
          json_extract(payload,'\$.sensores.hsuelo') AS hsuelo,
          json_extract(payload,'\$.rssi')            AS rssi
   FROM telemetry_buffer ORDER BY id DESC LIMIT 10;"
```

### Criterio de aceptación

- [ ] Cadencia estable acorde al `periodo_ms` configurado
- [ ] `t_rx_iso` presente en cada registro (base para medir latencia en Fase 6)
- [ ] Sin huecos ni duplicados

---

## T3 — Alertas del nodo y deduplicación

**Qué demuestra:** que el canal asíncrono de alertas funciona y no satura.

Con la simulación encendida, forzar una condición fuera de rango:

```bash
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_modulo","modulo":"alertas","activo":true}'

mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_umbral","variable":"temp","min":40,"max":50}'
```

La simulación ronda 18-30 °C, así que quedará fuera de rango. A los **5 minutos
sostenidos** el firmware publica una alerta `LEVE`.

```bash
sudo sqlite3 /var/lib/agw/buffer.db \
  "SELECT datetime(created_at,'unixepoch','localtime'), severity, alert_type, message
   FROM local_alerts ORDER BY id DESC LIMIT 10;"
```

### Criterio de aceptación

- [ ] La alerta llega y se persiste
- [ ] **No se duplica** pese a que el firmware la republica cada 5 s
- [ ] Escala de `LEVE` a `MEDIA` a los 20 minutos

Restaurar el umbral al terminar:

```bash
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_umbral","variable":"temp","min":10,"max":35}'
```

---

## T4 — Caída del nodo (LWT)

**Qué demuestra:** que el gateway detecta un nodo muerto sin esperar timeout.

Desconectar la alimentación del ESP32 de golpe (no un reinicio ordenado).

```bash
sudo journalctl -u agw-edge -f | grep -E "NODO CAIDO|LWT"
```

### Criterio de aceptación

- [ ] Aparece `NODO CAIDO (LWT) node=IoT-node-26.001`
- [ ] Se registra en `node_status` con `status=offline`

```bash
sudo sqlite3 /var/lib/agw/buffer.db "SELECT * FROM node_status;"
```

---

## T5 — Reinicio del servicio edge

**Qué demuestra:** que reiniciar el orquestador no pierde datos ni requiere
reconfigurar nada.

```bash
sudo sqlite3 /var/lib/agw/buffer.db "SELECT COUNT(*) FROM telemetry_buffer;"
sudo systemctl restart agw-edge
sleep 30
sudo sqlite3 /var/lib/agw/buffer.db "SELECT COUNT(*) FROM telemetry_buffer;"
```

### Criterio de aceptación

- [ ] El contador nunca baja
- [ ] El edge reconecta al broker en < 10 s
- [ ] Las reglas se recargan solas

---

## T6 — Corte de energía de la Raspberry

**Qué demuestra:** el escenario real de un cultivo rural. Es la prueba más
importante del conjunto.

```bash
sudo reboot
```

Con el monitor serie del ESP32 abierto, cronometrar. Al volver:

```bash
uptime
systemctl is-active agw-ap-ip hostapd dnsmasq mosquitto agw-edge
sudo sqlite3 /var/lib/agw/buffer.db "SELECT COUNT(*) FROM telemetry_buffer;"
sudo journalctl -u agw-edge -n 20 --no-pager
```

### Criterio de aceptación

- [ ] Los cinco servicios arrancan solos
- [ ] El ESP32 reconecta **sin intervención**
- [ ] El buffer conserva todos los registros previos
- [ ] Tiempo total hasta reanudar la telemetría: **< 90 s**

> Nota: al reiniciarse la Pi, hostapd arranca sin estado previo, así que **no
> aparece el retardo por estación fantasma** descrito en `RASPBERRY_SETUP.md`
> §4.4. Ese retardo solo afecta al reinicio aislado del nodo.

---

## T7 — Control bidireccional manual

**Qué demuestra:** que el canal descendente funciona para operación remota.

```bash
# Cambiar el ritmo de telemetría a 30 s
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_periodo","valor":30000}'

# Pedir estado inmediato
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"get_status"}'

# Vía HTTP, independiente de MQTT
curl -s http://10.42.0.26/estado | head -30
```

### Criterio de aceptación

- [ ] El período cambia y se refleja en `periodo_ms` de la telemetría
- [ ] Sobrevive al reinicio del nodo (persistido en NVS)
- [ ] Los dos planos de control responden

Restaurar:

```bash
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_periodo","valor":10000}'
```

---

## T8 — Ahorro de energía conmutable

**Qué demuestra:** que el nodo puede ajustar su consumo sin recompilar, y que el
push de comandos sobrevive al modem sleep.

```bash
curl -s http://10.42.0.26/modulos
```

Con `ahorro_wifi` en ON (modem sleep), comprobar que **los comandos siguen
llegando**:

```bash
mosquitto_pub -h 10.42.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"get_status"}'
```

### Criterio de aceptación

- [ ] El nodo responde al comando estando en modem sleep
- [ ] Conmutar el módulo cambia el consumo sin perder la conexión
- [ ] El RSSI se mantiene en rango operativo

> Para la Fase 6: medir consumo con multímetro en serie con la alimentación del
> nodo, en los niveles 0 y 1, y tabular consumo frente a latencia. Ver `MCD.md`
> §12.

---

## Resumen de resultados

| Prueba | Estado | Fecha | Observaciones |
|---|---|---|---|
| T1 Lazo autónomo | ⬜ | | |
| T2 Persistencia | ⬜ | | |
| T3 Alertas | ⬜ | | |
| T4 LWT | ⬜ | | |
| T5 Reinicio edge | ⬜ | | |
| T6 Corte de energía | ⬜ | | |
| T7 Bidireccional | ⬜ | | |
| T8 Ahorro energía | ⬜ | | |

**Al completar todas:** la capa Fog queda validada y se puede pasar a la Fase 3b
(sincronización con Neon) sin riesgo de estar construyendo sobre cimientos
inestables.
