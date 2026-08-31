# Cómo leer los HTML de resultados — VitalCrop AGW

> Para el agente que redacta el informe y la documentación del proyecto.
> Fecha de los datos: **31 de agosto de 2026**.

---

## 1. Lo primero, y lo que ahorra más trabajo

**No parsees el HTML ni leas las gráficas.** Cada fichero lleva todos sus
datos en un bloque JSON incrustado. Extráelo así:

```python
import json, re
from pathlib import Path

def datos(ruta):
    h = Path(ruta).read_text(encoding="utf-8")
    bruto = re.search(
        r'<script id="datos" type="application/json">(.*?)</script>',
        h, re.S).group(1)
    # Al incrustarlo se escapó "</" para no cerrar la etiqueta antes de tiempo
    return json.loads(bruto.replace(r"<\/", "</"))

memoria = datos("memoria-tecnica.html")
ensayos = datos("ensayos-conectividad.html")
```

Las gráficas se dibujan en el navegador **a partir de ese mismo JSON**. Si
citas un número, sácalo de ahí: es la misma fuente que ve el lector.

---

## 2. Los dos documentos

| Fichero | Qué es | Cuándo citarlo |
|---|---|---|
| `memoria-tecnica.html` (214 kB) | Memoria del **proyecto entero**: 23 días de serie, arquitectura, metodología, resultados y deuda. 12 secciones en números romanos. | Es la fuente por defecto para cualquier afirmación sobre el sistema. |
| `ensayos-conectividad.html` (150 kB) | Registro de **una jornada de ensayos**, el 30 de agosto. 15 secciones numeradas. | Solo para el detalle de las pruebas de ese día. |

Ambos son autocontenidos: se abren con doble clic. Solo piden tipografías a
Google Fonts; sin red caen a las del sistema y todo lo demás funciona.

### Secciones de `memoria-tecnica.html`

| | |
|---|---|
| I | El sistema y el reparto de decisiones |
| II | Metodología e instrumentos |
| III | Cobertura del conjunto de datos |
| IV | Calidad del enlace inalámbrico |
| V | Regularidad de la cadencia |
| VI | Patrones horarios y estacionales |
| VII | Caudal, tiempo de aire y capacidad |
| VIII | El nodo fog: resiliencia, recursos y caída de datos |
| IX | El cultivo como carga de trabajo |
| X | Cruces entre variables |
| XI | Contraste con los objetivos |
| XII | Limitaciones y deuda técnica |

### Secciones de `ensayos-conectividad.html`

1 El canal era el problema · 2 El espectro alrededor del cultivo ·
3 Latencia de cada tramo · 4 Cuántos aparatos aguanta la red ·
5 Cuatro cortes provocados · 6 Tiempos de recuperación ·
7 El cultivo, mientras tanto · 8 Contra los objetivos del §9 ·
9 Un segundo nodo en la misma red · 10 Qué le hizo al cultivo real ·
11 La capacidad, ahora con dos medidas · 12 Tres fallos que solo aparecieron
al haber dos nodos · 13 El nodo fog y la caída de datos · 14 Qué hace la
niebla cuando se cae internet · 15 Las pruebas de conexión sobre el nodo fog

---

## 3. Mapa del JSON

### Presentes en los dos ficheros

**`fog_bloque`** — el nodo fog y la caída de datos.

| Clave | Forma | Contenido |
|---|---|---|
| `recibidas` / `perdidas` | entero | 33.127 tramas recibidas · 661 no recibidas en toda la serie |
| `huecos` | lista[36] | `{desde, min, cad, perd, causa}` — cada periodo sin una sola trama |
| `huecos_causa` | lista[5] | Los 36 agrupados: `{causa, huecos, minutos, tramas, cadencia, desde, hasta}` |
| `que_sobrevive` | lista[5] | Qué siguió funcionando en cada tipo de hueco |
| `fog_recursos` | lista[4] | CPU, memoria, disco y temperatura de la Raspberry |
| `fog_stack` | lista[5] | Los cinco procesos, con `cpu` (%) y `mem` (MiB) |
| `fog_archivo` | lista[4] | Filas por tabla del archivo local |
| `fog_autonomia` | objeto | `dias`, `tramas`, `pct`, `ciclos`, `minutos`, `mttr`, `peor`, `n_rec` |
| `fog_decisiones` | lista[6] | Eventos del borde con su recuento |
| `reconexiones` | lista[5] | Las cinco desasociaciones: `{caida, vuelta, seg}` |
| `estaciones` | lista[228] | Estaciones asociadas cada minuto: `{t, n, esp, n2}` |
| `tasas` | lista[8] | Tasa negociada por estación: `{mac, nom, p:[[hora, Mbit/s]]}` |
| `sin_internet` | lista[8] | Cronología del corte: `{t, q, c, d}` — `c` es la capa |
| `sin_internet_capas` | lista[10] | Las diez funciones: `{f, e, w, d}` — `e` es intacto/detenido/diferido |
| `pruebas_conexion` | lista[9] | Los nueve ensayos: `{p, q, r, v}` |

### Solo en `memoria-tecnica.html`

| Clave | Contenido |
|---|---|
| `r7` / `r30` | Métricas del §9 a 7 y 30 días: `cobertura`, `rssi`, `perdida`, `jitter_por_cadencia`, `reinicios_nodo`, `latencia_subida`, `recuperacion_de_buffer`, `no_instrumentado` |
| `fog` | Respuesta cruda de autonomía: `ventana`, `autonomia`, `decisiones_del_borde`, `riego_autonomo`, `recuperaciones`, `huecos_de_datos` |
| `diario` | lista[23] — un día por fila: tramas, esperadas, rssi, temp, ciclos de riego, reinicios |
| `perfil` | Día tipo: `horas[24]`, `riego_por_hora[24]`, **`dias_observados`**, **`dias_con_riego`**, `zona` |
| `heat_rssi` / `heat_temp` | Mapas hora × día: `celdas` = `[[día, hora, valor]]` |
| `multi` | 14 días de temperatura, humedad, EC y RSSI en la misma rejilla |
| `corr_tec` / `corr_trssi` | Nubes de puntos con su coeficiente `r` |
| `dist_rssi` / `dist_temp` | Histogramas con `bins` que ya traen `pct` y `cdf` |
| `riego`, `ev_resumen`, `ev_ultimos`, `dur_riego`, `gateway`, `devices` | Auxiliares |

### Solo en `ensayos-conectividad.html`

`rssi_serie` (303 puntos del experimento A/B/A/B) · `canal_resumen` ·
`hist_c6` / `hist_c11` · `scan_antes` / `scan_despues` (barridos de espectro) ·
`interferencia` (por canal) · `latencias` · `capacidad` · `alcance` ·
`carga_invitados` · `recuperaciones` · `cortes` · `escalera` · `objetivos` ·
`riego_hora` · `nodo2_ficha` · `dos_nodos` · `impacto_nodo2` ·
`aire_por_nodo` · `capacidad_actualizada` · `fallos_nodo2`

---

## 4. Siete avisos antes de citar cifras

### 4.1 Hay **dos** cifras de pérdida y las dos son ciertas

- **1,96 %** sobre toda la serie (661 de 33.788). Está dominada por el primer
  día: **540 de esas 661 se perdieron montando el sistema**, con el nodo
  reiniciándose a mano y publicando cada 10 s. Otras 94, reflasheando.
- **La de `r7.perdida.pct`** es la del sistema en operación, ventana móvil de
  siete días.

No cites una sin la otra. Dar solo la primera es injusto con el sistema; dar
solo la segunda oculta de dónde salen los datos. El desglose está en
`fog_bloque.huecos_causa`.

### 4.2 `r7` es una ventana **móvil**: no la fijes en el texto

Se recalcula sobre los últimos siete días. Si escribes un número a mano, en una
semana contradirá a la tabla. En los HTML esa cifra se inyecta desde el dato
justo por eso.

### 4.3 Las horas son de Colombia, y eso costó una corrección

Todo el análisis horario convierte a `America/Bogota`. Una versión anterior lo
extraía en UTC y la banda del fotoperiodo salía entre las 11:00 y las 23:00 en
vez de entre las 6:00 y las 18:00. **Si encuentras material antiguo con horas
corridas cinco horas, está mal.** `perfil.zona` lo declara.

### 4.4 El segundo nodo es sintético y está excluido

`IoT-node-26.002` es un ESP32 real sobre la red real, pero sus sensores no
existen: el firmware genera temperatura y humedad. Sirvió para medir capacidad
multinodo. **Sus tramas están fuera de todas las métricas del §9** (vista
`telemetria_real` en la base). Menciónalo si hablas de él; no lo mezcles con
las cifras del enlace.

### 4.5 «Ciclos por hora» necesita el divisor correcto, y aun así sale bajo

Divide `perfil.riego_por_hora` entre **`perfil.dias_con_riego`**, nunca entre
los días de telemetría ni entre un número deducido del recuento de muestras:
los eventos de riego empezaron a registrarse después que la telemetría.

Con eso salen **3,50 de día y 0,88 de noche**, no los 4 y 1 del diseño. La
diferencia no es un fallo: `dias_con_riego` cuenta también los días
**parciales** de los extremos de la ventana —el primero empieza a media tarde y
el último va por la mañana—, y eso diluye la media.

Para citar la cifra de diseño, restringe a días completos:

```sql
-- 60 ciclos/día es la expectativa: 4×12 de día + 1×12 de noche
SELECT EXTRACT(HOUR FROM ts AT TIME ZONE 'America/Bogota')::int AS hora,
       COUNT(*)::numeric / COUNT(DISTINCT (ts AT TIME ZONE 'America/Bogota')::date) AS por_hora
FROM node_eventos
WHERE evento LIKE 'riego_%_fin'
  AND (ts AT TIME ZONE 'America/Bogota')::date IN (
      SELECT (ts AT TIME ZONE 'America/Bogota')::date FROM node_eventos
      WHERE evento LIKE 'riego_%_fin' GROUP BY 1 HAVING COUNT(*) >= 55)
GROUP BY 1 ORDER BY 1;
```

Así da **4,00 y 1,00 exactos** sobre siete días completos, sin una sola
desviación entre las 00:00 y las 19:00.

**Un aviso sobre las horas 20:00–23:00.** Ahí verás 1,14 a 1,86 en vez de 1,00.
No es deriva del sistema: el 30 de agosto se accionaron riego y luz a mano para
grabar unos vídeos, y ese día tiene 74 ciclos en vez de 60. Si citas el perfil
horario, o excluyes el 30/08 o mencionas la intervención.

### 4.6 El RSSI lo mide el nodo, no el punto de acceso

El controlador `brcmfmac` de la Raspberry no expone la potencia por estación en
modo punto de acceso. Todo RSSI del informe es **el que el ESP32 mide de la
señal del AP**. Para los aparatos invitados, que no tienen firmware propio, el
indicador de calidad es la **tasa negociada** (`fog_bloque.tasas`).

### 4.7 Recuperación: hay dos poblaciones

- Las provocadas en los ensayos (cambios de canal, reinicio del servicio):
  **entre 3,6 y 11,5 s**.
- Las cinco desasociaciones históricas (`fog_bloque.reconexiones`): media de
  **119 s**, con una de 182 s que arrastra la media por encima del objetivo de
  90 s. **Ninguna se debió a un fallo del enlace** — tres del reflasheo del 23,
  una de la actualización del 25 y una provocada.

Di de cuál hablas.

---

## 5. Las afirmaciones defendibles, y de dónde salen

| Afirmación | Dato |
|---|---|
| El cultivo operó **22,3 días sin nube**, el 95,9 % del histórico | `fog_bloque.fog_autonomia` |
| El riego cumple **4 ciclos/hora de día y 1 de noche**, sin desviación en 7 días completos | ver 4.5 — hay que filtrar días parciales |
| Perder internet **no cuesta ni una trama**: 21 min de corte, 5 retenidas, 0 perdidas | `cortes` · `escalera` · `sin_internet` |
| Perder el gateway **sí cuesta** datos, en proporción al corte | `cortes` — el nodo publica en QoS 0 y no guarda |
| En los 36 huecos, **229 minutos sin telemetría**, el riego no falló una vez | `fog_bloque.huecos` · `que_sobrevive` |
| Todo el stack del borde cabe en **49 MiB y menos del 1 % de un núcleo** | `fog_bloque.fog_stack` |
| Cambiar del canal 6 al 11 dio **+10,63 dB** y llevó el tiempo bajo umbral del 61,4 % al 0,0 % | `canal_resumen` (ensayos) |
| El punto de acceso sostuvo **6 estaciones** sin rechazos | `capacidad` · `fog_bloque.estaciones` |
| Un segundo nodo **no degradó** al del cultivo | `impacto_nodo2` |
| Las balizas del AP cuestan **13 veces más** tiempo de aire que un nodo | `aire_por_nodo` — 0,82 % contra 0,063 % |
| El límite de nodos hoy es el **pool DHCP: 41**, no el ancho de banda | `capacidad_actualizada` |

---

## 6. Lo que **no** debes afirmar

- **Latencia de extremo a extremo.** No está instrumentada. Lo que hay es desde
  que el gateway recibe, no desde que el nodo publica. Requiere reflashear.
- **Comparación entre niveles de QoS.** Imposible: la biblioteca MQTT del
  firmware solo publica en QoS 0.
- **Sondas activas de ICMP/MQTT/HTTP.** Se ejecutan pero no se persisten.
- **Techo de estaciones del controlador.** Broadcom no lo publica. Lo medido
  son 6 simultáneas, sin haber buscado el límite.
- **Calibración del sensor de nivel.** La referencia en seco quedó en el valor
  de fábrica (3000) muy por debajo del real (4095), así que el indicador `agua`
  de la telemetría **nunca se dispara**. El corte del llenado sí funciona,
  porque usa un delta relativo.

`r7.no_instrumentado` lo lleva en el propio dato. Declararlo es preferible a
estimarlo.

---

## 7. Dos resultados con matices que conviene no perder

**El llenado de sustrato.** Solo hay **un** registro completo: 72 s, cortó por
sensor —no por el tope de 600 s—, el convertidor cayó de 4095 a 3123 cuentas y
la conductividad pasó de 867 a 1013 µS/cm. Ese registro vive en memoria volátil
y se perdió en el siguiente corte de energía: existe porque se leyó antes. Es a
la vez la prueba de que el corte por sensor funciona y la razón de que
persistirlo esté en la deuda.

**La dispersión del RTT.** El enlace al nodo son cinco metros y su RTT va de
8,6 a 220,9 ms. No es congestión: el ESP32 tiene el ahorro de energía activo y
su radio duerme entre balizas. El AP emite una cada 100 ms con DTIM 2, así que
el nodo despierta cada 200 ms como mucho — y el máximo observado, 220,9 ms, es
exactamente un ciclo de DTIM más el proceso.

---

## 8. Enlaces publicados

Las mismas páginas, en línea y siempre en estas direcciones:

- Memoria técnica — `https://claude.ai/code/artifact/fa1bee0f-9978-4b01-8331-0b2528955605`
- Ensayos de conectividad — `https://claude.ai/code/artifact/b6b06dc8-b9a5-4ee2-a490-b742d90ab7aa`

---

## 9. Si algo no cuadra

Los HTML se regeneran desde la API de la nube, así que **los datos pueden ser
más recientes que la prosa de alrededor**. Cuando una cifra del texto
contradiga a la de una tabla, **manda la tabla**: se dibuja desde el JSON.

Las cifras del §9 salen de `https://agw-cloud-api.vercel.app/api/metricas/*`,
que lee de la vista `telemetria_real` — la que excluye el nodo sintético.
