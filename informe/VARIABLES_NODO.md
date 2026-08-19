# Variables y comandos del nodo — IoT-node-26.001

Todo lo que se puede tocar del cultivo desde la Raspberry, ordenado por **lo
que cuesta cambiarlo**. Firmware v2.2.0.

Los tres planos de control aceptan el mismo JSON:

```bash
# MQTT — el habitual, desde la Pi
mosquitto_pub -h 127.0.0.1 -t cultivo/indoor/hierbabuena/cmd -m '<json>'

# HTTP — sigue funcionando aunque el broker esté caído
curl -s -X POST http://10.42.0.26/cmd -H 'Content-Type: application/json' -d '<json>'

# Consola serie — para banco, con atajos propios
pio device monitor
```

---

## Reparto de responsabilidades

**La Pi manda sobre el PROGRAMA. El nodo manda sobre sus MÓDULOS.**

El gateway reenvía el programa completo al arrancar y cada vez que el nodo se
reasocia al WiFi. Lo que cambies en caliente sobre el nodo dura hasta ese
momento; para que dure, cámbialo en `config.yaml` de la Pi.

Los módulos son distintos: la Pi no los toca nunca. Viven en la NVS del ESP32 y
sobreviven a todo, incluido reflashear.

---

## Capa 1 — En caliente, efecto inmediato

Persisten en NVS. El nodo sigue ejecutándolos aunque la Pi desaparezca.

### Programa de cultivo

`{"cmd":"set_programa", ...}` — admite parcial, envía solo lo que cambies.

| Variable | Qué gobierna | Rango | Ahora |
|---|---|---|---|
| `hora_luz_on` | Hora de encendido de luz y ventilador | 0–23 | 6 |
| `hora_luz_off` | Hora de apagado | 0–23 | 20 |
| `hidro_riego_dia_s` | Segundos bombeando, de día | 10–21600 | 300 |
| `hidro_descanso_dia_s` | Segundos de parada, de día | 10–86400 | 600 |
| `hidro_riego_noche_s` | Segundos bombeando, de noche | 10–21600 | 300 |
| `hidro_descanso_noche_s` | Segundos de parada, de noche | 10–86400 | 3300 |
| `tierra_cada_dias` | Cada cuánto se llena la tierra | 1–365 | 10 |
| `tierra_hora` | A qué hora del día se llena | 0–23 | 7 |
| `telemetria_s` | Cadencia de publicación | 5–3600 | 60 |
| `proximo_riego_tierra` | Fecha del siguiente llenado (epoch local) | — | calculado |

La cadencia de hidroponía es **riego + descanso**. Cambiar uno sin el otro
descuadra los riegos por hora:

| | Riego | Descanso | Ciclo | Riegos/hora |
|---|---|---|---|---|
| Día | 300 s | 600 s | 15 min | 4 |
| Noche | 300 s | 3300 s | 60 min | 1 |

```bash
# Bajar el llenado de tierra a 9 días
mosquitto_pub -h 127.0.0.1 -t cultivo/indoor/hierbabuena/cmd \
  -m '{"cmd":"set_programa","tierra_cada_dias":9}'
```

Al cambiar `tierra_cada_dias` se recalcula la fecha ya programada, así que el
cambio se nota en el ciclo en curso y no en el siguiente.

### Módulos

`{"cmd":"set_modulo","modulo":"<nombre>","activo":true|false}`

| Módulo | Qué enciende | Fábrica |
|---|---|---|
| `telemetria` | Publicación periódica de sensores | ON |
| `status` | Heartbeat cada 60 s | ON |
| `alertas` | Monitor de umbrales | ON |
| `sensor_hdc` | HDC1080: temperatura y humedad del aire | ON |
| `sensor_suelo` | Sensor de nivel de agua en el sustrato | ON |
| `sensor_ec` | Conductividad de la solución | ON |
| `riego_hidro` | Ciclos de hidroponía | ON |
| `riego_tierra` | Calendario de llenado de tierra | ON |
| `ambiente` | Luz y ventilador por fotoperiodo | ON |
| `ahorro_wifi` | Modem sleep: 120 mA → 25 mA | ON |
| `sensor_ph` | Retirado del alcance, sin sonda | off |
| `simulacion` | Valores sintéticos — **enmascara los sensores reales** | off |
| `test_valvulas` | Barrido de relés, ignora el riego | off |

`{"cmd":"reset_modulos"}` devuelve los trece a los valores de fábrica de arriba.
Es la forma corta de dejar el nodo en producción tras un reflasheo.

### Umbrales de alerta

`{"cmd":"set_umbral","variable":"<var>","min":<n>,"max":<n>}`
Variables: `temp`, `hum`, `hsuelo`, `ph`.

---

## Capa 1 — Acciones

No son variables: se ejecutan y ya.

| Comando | Efecto |
|---|---|
| `{"cmd":"luz","encendida":false}` | Apaga la luz **solo por hoy**. Caduca a `hora_luz_off` y mañana enciende sola |
| `{"cmd":"luz","encendida":true}` | Levanta el veto ahora mismo |
| `{"cmd":"llenar_tierra"}` | Llena la tierra ya. Cuenta como el riego del ciclo |
| `{"cmd":"llenar_tierra","prueba":true}` | Llena sin tocar el calendario |
| `{"cmd":"medir_ec"}` | Medida puntual de conductividad, devuelta en la respuesta |
| `{"cmd":"set_riego","encendido":true}` | Riego manual: bomba + válvula de hidroponía |
| `{"cmd":"set_salida","salida":"bomba","activo":true}` | Un relé suelto. Nombres: `hidroponia`, `tierra`, `bomba`, `ambiente` |
| `{"cmd":"salidas_off"}` | Todo abajo y automatismos fuera |
| `{"cmd":"set_hora","epoch":<n>}` | Fija el reloj. Epoch **local**, no UTC |
| `{"cmd":"set_log","nivel":0..4}` | 0 silencio · 1 errores · 3 info · 4 depuración |
| `{"cmd":"set_periodo","valor":<ms>}` | Cadencia de telemetría en ms, mínimo 5000 |
| `{"cmd":"get_status"}` | Publica el status ahora |
| `{"cmd":"get_programa"}` / `{"cmd":"get_modulos"}` / `{"cmd":"get_salidas"}` | Los imprime por serie |
| `{"cmd":"reset"}` | Reinicia el ESP32 |

**Cuidado con el riego manual y `set_salida`**: apagan `riego_hidro`,
`riego_tierra` y `ambiente` para no pelearse por los relés. Se vuelven a
encender con `set_modulo` o `reset_modulos`.

### Atajos de la consola serie

```
llenar          llenar prueba       tierra <dias>       ec
luz off         luz on              sensores on|off     mon on|off
programa        estado              salidas             log <0-4>
on 1 3 4        off                 off 3               test on|off
cal nivel       cal cero            cal tds <ppm>       i2c
```

---

## Capa 2 — En la Pi, duradero

`/opt/agw-edge/edge_controller/config.yaml`, y después:

```bash
sudo systemctl restart agw-edge
```

Es la fuente de verdad: el gateway reenvía esto al nodo en cada arranque y en
cada reasociación. Lo que cambies aquí sobrevive a un reflasheo del ESP32.

| Sección | Variables |
|---|---|
| `programa:` | Las diez de la tabla del programa de cultivo |
| `ap_watcher:` | `enabled`, `interface`, `node_mac`, `poll_seconds`, `settle_seconds` |
| `mqtt:` | `broker_host`, `broker_port`, `qos`, `keepalive` |
| `rules:` | `enabled`, `rules_file` — umbrales del motor de reglas del edge |
| `storage:` | `db_path`, `max_buffered_records` |

`ap_watcher` es lo que detecta que el nodo se fue del WiFi y volvió, para
reponerle hora y programa sin esperar al heartbeat.

---

## Capa 3 — Requiere recompilar y flashear

`iot-nodes/agw-hydro-node/include/config.h`. Son decisiones de ingeniería, no
de operación diaria.

| Variable | Qué es | Valor |
|---|---|---|
| `PROG_TIERRA_DELTA_CORTE` | Caída de ADC que corta el llenado | 100 |
| `PROG_TIERRA_CORTE_CONFIRMA` | Lecturas seguidas que deben confirmarla | 3 |
| `PROG_TIERRA_MAX_S` | Tope de seguridad del llenado | 600 |
| `PROG_TIERRA_USA_BOMBA` | La tierra se alimenta por bombeo, no por gravedad | true |
| `NIVEL_DELTA_MIN` | Caída que se considera "hay agua" | 800 |
| `SEG_MAX_BOMBA_CONTINUA_S` | La bomba nunca más de esto seguido | 3600 |
| `SEG_MIN_ENTRE_RIEGOS_S` | Descanso mínimo entre riegos | 30 |
| `SEG_TEMP_CORTE_LUZ_C` | Sobretemperatura: se apaga la luz | 38.0 |
| `SEG_TEMP_REANUDAR_LUZ_C` | Y se reanuda al bajar de aquí | 34.0 |
| `SEG_VERIFICAR_ANTES_RIEGO` | No regar si el sensor ya acusa agua | true |
| `MQTT_BUFFER_BYTES` | Buffer de PubSubClient por cliente | 1280 |
| `MQTT_KEEPALIVE` | Keepalive, atado al vigilante de estaciones del AP | 20 |
| `RELE_ACTIVO_BAJO` | Polaridad de los módulos de relé | true |
| `PIN_SENSOR_WATER` · `PIN_EC_SENSOR` | GPIO 32 y 33, ambos ADC1 | — |
| `TDS_FACTOR` · `TDS_COEF_TEMP` | Curva del fabricante de la sonda TDS | 0.5 · 0.02 |
| `DEFAULT_MOD_*` | Valores de fábrica de los módulos | ver tabla |

Los `DEFAULT_MOD_*` no se aplican al flashear: la NVS conserva lo que hubiera.
Solo entran con `{"cmd":"reset_modulos"}`.

### Calibración — se cambia en caliente pero solo por consola serie

| Comando | Cuándo |
|---|---|
| `cal nivel` | Con el sustrato **seco**. Fija la referencia del sensor de nivel |
| `cal cero` | Sonda TDS **al aire y seca**. Fija el offset del módulo |
| `cal tds <ppm>` | Contra una solución patrón conocida |

Persisten en NVS y sobreviven al reflasheo.

---

## Comprobar qué está haciendo el nodo

```bash
# Estado completo, sin depender de MQTT
curl -s http://10.42.0.26/estado | python3 -m json.tool

# El siguiente status que publique
mosquitto_sub -h 127.0.0.1 -t cultivo/indoor/hierbabuena/status -C 1

# Riegos de tierra registrados por el gateway
sudo sqlite3 /var/lib/agw/buffer.db \
  "SELECT datetime(created_at,'unixepoch','localtime'), sensor_data
     FROM local_alerts WHERE alert_type='RIEGO_TIERRA'
     ORDER BY created_at DESC LIMIT 5;"
```

En `/estado`, lo que importa:

- `modulos.riego_hidro` — el automatismo está activo
- `ejecutando.riego_hidro` — está bombeando **ahora**
- `salidas[]` — el estado real de cada relé, por si discrepa del automatismo
- `programa` — el plan que el nodo está ejecutando, que no tiene por qué ser el
  que la Pi cree haberle enviado
- `ult_llenado` — duración, si cortó el sensor o el reloj, y la EC antes/después
- `seguridad.luz_vetada` — la luz está apagada a mano, no averiada
