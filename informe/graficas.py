#!/usr/bin/env python3
"""
Genera el HTML con las graficas del proyecto, leyendo de la base.

    python graficas.py
    python graficas.py --salida otro.html --dias 30

Solo necesita psycopg2. Las graficas las pinta ECharts en el navegador,
asi que el HTML pesa poco y se puede hacer zoom en las series.

DATABASE_URL se busca en el entorno o en el .env de agw-cloud-api.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras

# Hora del cultivo. Neon abre las sesiones en GMT y sin esto el perfil
# horario sale corrido cinco horas.
ZONA = "America/Bogota"

AZUL, NARANJA, VERDE, ROJO, GRIS = "#2a78d6", "#eb6834", "#1baf7a", "#d03b3b", "#9a9a94"

BLOQUES = []


# ── Base de datos ────────────────────────────────────────────

def url_bd():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    aqui = Path(__file__).resolve().parent
    for env in (aqui.parent / "agw-cloud-api" / ".env", aqui / ".env", Path(".env")):
        if not env.exists():
            continue
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith("DATABASE_URL="):
                return linea.split("=", 1)[1].strip()
    sys.exit("No encuentro DATABASE_URL. Exportala o deja el .env de la API en su sitio.")


def conectar():
    # Neon falla la resolucion DNS de vez en cuando; reintentar sale mas
    # barato que abortar el informe entero.
    for intento in range(5):
        try:
            return psycopg2.connect(url_bd(), cursor_factory=psycopg2.extras.RealDictCursor)
        except psycopg2.OperationalError as exc:
            if intento == 4:
                sys.exit(f"No pude conectar a la base: {exc}")
            print(f"  reintentando conexion ({intento + 1}/5)...")
            time.sleep(4)


def q(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def f(v, d=1):
    return None if v is None else round(float(v), d)


def mil(n):
    """31781 -> 31.781. Solo sobre el numero, nunca sobre la frase entera."""
    return f"{int(n):,}".replace(",", ".")


# ── Piezas comunes de las graficas ───────────────────────────

EJE = {"axisLine": {"lineStyle": {"color": "#c9c9c4"}},
       "axisTick": {"show": False},
       "axisLabel": {"color": "#6b6b66", "fontSize": 10},
       "splitLine": {"lineStyle": {"color": "#ecece8"}}}

TIP = {"backgroundColor": "rgba(20,20,18,.94)", "borderWidth": 0,
       "textStyle": {"color": "#fff", "fontSize": 11}}


def grafica(titulo, texto, option, alto=340):
    BLOQUES.append({"titulo": titulo, "texto": texto, "option": option, "alto": alto})
    print(f"  [{len(BLOQUES):2d}] {titulo}")


def seccion(titulo, bajada=""):
    BLOQUES.append({"seccion": titulo, "bajada": bajada})


def marca_umbral(valor, etiqueta, color=ROJO):
    """Linea horizontal de referencia con su rotulo."""
    return {"silent": True, "symbol": "none",
            "lineStyle": {"color": color, "type": "dashed", "width": 1.4},
            "label": {"formatter": etiqueta, "color": color, "fontSize": 10,
                      "position": "insideEndTop"},
            "data": [{"yAxis": valor}]}


# ═════════════════════════════════════════════════════════════
#  PARTE 1 · Metricas de conexion
# ═════════════════════════════════════════════════════════════

def g_balance(cur, dias):
    filas = q(cur, f"""
        WITH t AS (
            SELECT date_trunc('day', t_rx AT TIME ZONE '{ZONA}') AS dia,
                   COUNT(*) AS tramas, AVG(rssi) AS rssi, AVG(periodo_ms) AS periodo
            FROM telemetria_real
            WHERE t_rx > now() - (%s || ' days')::interval
            GROUP BY 1)
        SELECT dia, tramas, rssi,
               GREATEST(ROUND(86400 / NULLIF(periodo, 0) * 1000), 1) AS esperadas
        FROM t ORDER BY dia
    """, (dias,))
    if not filas:
        return
    et = [x["dia"].strftime("%d/%m") for x in filas]
    rec = [x["tramas"] for x in filas]
    # El ultimo dia va a medias: su "esperadas" sale alto y pintaria una
    # perdida que no existe.
    per = [max(0, min(int(x["esperadas"]), 3000) - x["tramas"]) for x in filas]
    per[-1] = 0

    # Dos rejillas y no dos ejes: tramas y dBm no comparten escala, y
    # superponerlas haria que la relacion dependiera de donde pongo el cero.
    grafica("Cobertura diaria y señal",
            "Cada barra es lo que esperaba recibir ese día; el trozo rojo, lo que faltó. "
            "Abajo la señal media del mismo día. Los días con más pérdida son los que "
            "toqué el firmware, no los de peor señal.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": [{"left": 58, "right": 24, "top": 34, "height": 170},
                      {"left": 58, "right": 24, "top": 236, "height": 92}],
             "xAxis": [{**EJE, "type": "category", "data": et, "gridIndex": 0,
                        "axisLabel": {"show": False}},
                       {**EJE, "type": "category", "data": et, "gridIndex": 1,
                        "axisLabel": {**EJE["axisLabel"], "rotate": 45}}],
             "yAxis": [{**EJE, "type": "value", "name": "tramas", "gridIndex": 0},
                       {**EJE, "type": "value", "name": "dBm", "scale": True, "gridIndex": 1}],
             "series": [
                 {"name": "Recibidas", "type": "bar", "stack": "c", "data": rec,
                  "itemStyle": {"color": AZUL}},
                 {"name": "No recibidas", "type": "bar", "stack": "c", "data": per,
                  "itemStyle": {"color": ROJO}},
                 {"name": "RSSI medio", "type": "line", "xAxisIndex": 1, "yAxisIndex": 1,
                  "data": [f(x["rssi"]) for x in filas], "smooth": True,
                  "symbolSize": 5, "lineStyle": {"width": 2, "color": NARANJA},
                  "itemStyle": {"color": NARANJA},
                  "markLine": marca_umbral(-70, "objetivo −70 dBm")},
             ]}, 400)


def g_rssi(cur, dias):
    filas = q(cur, """
        SELECT rssi, COUNT(*) n FROM telemetria_real
        WHERE rssi IS NOT NULL AND t_rx > now() - (%s || ' days')::interval
        GROUP BY 1 ORDER BY 1
    """, (dias,))
    if not filas:
        return
    x = [str(r["rssi"]) for r in filas]
    tot = sum(r["n"] for r in filas)
    pct, acum, s = [], [], 0.0
    for r in filas:
        p = 100 * r["n"] / tot
        s += p
        pct.append(round(p, 2)); acum.append(round(s, 1))
    bajo = next((a for r, a in zip(filas, acum) if r["rssi"] >= -70), 0)

    grafica("Potencia recibida y su acumulada",
            f"El histograma dice dónde vive la señal. La curva de abajo responde lo que "
            f"importa: estuve por debajo del umbral de −70 dBm el {bajo:.1f} % del tiempo.",
            {"tooltip": {**TIP, "trigger": "axis"},
             "grid": [{"left": 58, "right": 24, "top": 22, "height": 150},
                      {"left": 58, "right": 24, "top": 208, "height": 100}],
             "xAxis": [{**EJE, "type": "category", "data": x, "gridIndex": 0,
                        "axisLabel": {"show": False}},
                       {**EJE, "type": "category", "data": x, "gridIndex": 1,
                        "name": "dBm", "nameLocation": "middle", "nameGap": 26}],
             "yAxis": [{**EJE, "type": "value", "name": "% tramas", "gridIndex": 0},
                       {**EJE, "type": "value", "name": "% acum.", "max": 100, "gridIndex": 1}],
             "series": [
                 {"type": "bar", "data": pct, "itemStyle": {"color": AZUL},
                  "name": "Frecuencia"},
                 {"type": "line", "xAxisIndex": 1, "yAxisIndex": 1, "data": acum,
                  "name": "Acumulada", "symbol": "none", "itemStyle": {"color": NARANJA},
                  "lineStyle": {"width": 2.2, "color": NARANJA},
                  "areaStyle": {"color": "rgba(235,104,52,.14)"}},
             ]}, 380)


def g_perfil(cur, dias):
    horas = q(cur, f"""
        SELECT EXTRACT(HOUR FROM t_rx AT TIME ZONE '{ZONA}')::int h,
               AVG(temperatura) t, AVG(rssi) r
        FROM telemetria_real
        WHERE t_rx > now() - (%s || ' days')::interval
        GROUP BY 1 ORDER BY 1
    """, (dias,))
    # Solo dias completos: los parciales de los extremos diluyen la media
    # y sacan 3,5 riegos/hora donde son 5.
    riego = q(cur, f"""
        SELECT EXTRACT(HOUR FROM ts AT TIME ZONE '{ZONA}')::int h,
               COUNT(*)::numeric /
               NULLIF(COUNT(DISTINCT (ts AT TIME ZONE '{ZONA}')::date), 0) c
        FROM node_eventos
        WHERE evento = 'riego_hidroponia_fin'
          AND (ts AT TIME ZONE '{ZONA}')::date IN (
              SELECT (ts AT TIME ZONE '{ZONA}')::date FROM node_eventos
              WHERE evento = 'riego_hidroponia_fin'
              GROUP BY 1 HAVING COUNT(*) >= 55)
        GROUP BY 1 ORDER BY 1
    """)
    if not horas:
        return
    ph = {r["h"]: r for r in horas}
    pr = {r["h"]: f(r["c"], 2) for r in riego}
    H = [f"{h:02d}" for h in range(24)]
    noche = {"itemStyle": {"color": AZUL}}

    grafica("El día tipo",
            "Los días plegados en veinticuatro horas, sobre nueve jornadas completas. "
            "Abajo el riego hidropónico: cinco ciclos por hora entre las 06:00 y las 17:00 "
            "(barras naranjas) y algo más de uno el resto. Los dos escalones caen justo en "
            "las 06:00 y las 18:00, que es el horario que tiene programado el nodo. El de "
            "tierra no aparece porque su accionamiento no se registra como evento.",
            {"tooltip": {**TIP, "trigger": "axis"},
             "axisPointer": {"link": [{"xAxisIndex": "all"}]},
             "grid": [{"left": 58, "right": 24, "top": 22, "height": 110},
                      {"left": 58, "right": 24, "top": 164, "height": 110},
                      {"left": 58, "right": 24, "top": 306, "height": 100}],
             "xAxis": [{**EJE, "type": "category", "data": H, "gridIndex": i,
                        "axisLabel": ({"show": False} if i < 2 else EJE["axisLabel"])}
                       for i in range(3)],
             "yAxis": [{**EJE, "type": "value", "name": "°C", "scale": True, "gridIndex": 0},
                       {**EJE, "type": "value", "name": "dBm", "scale": True, "gridIndex": 1},
                       {**EJE, "type": "value", "name": "riegos/h", "gridIndex": 2}],
             "series": [
                 {"name": "Temperatura", "type": "line", "data": [f(ph[h]["t"], 2) if h in ph else None for h in range(24)],
                  "smooth": True, "symbolSize": 4, "lineStyle": {"color": NARANJA, "width": 2},
                  "itemStyle": {"color": NARANJA},
                  "areaStyle": {"color": "rgba(235,104,52,.13)"}},
                 {"name": "RSSI", "type": "line", "xAxisIndex": 1, "yAxisIndex": 1,
                  "data": [f(ph[h]["r"]) if h in ph else None for h in range(24)],
                  "smooth": True, "symbolSize": 4, "lineStyle": {"color": AZUL, "width": 2},
                  "itemStyle": {"color": AZUL},
                  "markLine": marca_umbral(-70, "−70 dBm")},
                 {"name": "Riegos", "type": "bar", "xAxisIndex": 2, "yAxisIndex": 2,
                  "data": [{"value": pr.get(h, 0),
                            "itemStyle": {"color": NARANJA if 6 <= h < 18 else AZUL}}
                           for h in range(24)]},
             ]}, 480)


def g_huecos(cur):
    filas = q(cur, f"""
        WITH s AS (SELECT t_rx, LAG(t_rx) OVER (ORDER BY t_rx) prev,
                          LAG(periodo_ms) OVER (ORDER BY t_rx) pp
                   FROM telemetria_real)
        SELECT (prev AT TIME ZONE '{ZONA}')::date dia,
               EXTRACT(EPOCH FROM (t_rx - prev))::int seg,
               ROUND(EXTRACT(EPOCH FROM (t_rx-prev)) / (COALESCE(pp,300000)/1000.0))::int - 1 perd
        FROM s
        WHERE prev IS NOT NULL
          AND EXTRACT(EPOCH FROM (t_rx-prev)) > 3*COALESCE(pp,300000)/1000
        ORDER BY prev
    """)
    if not filas:
        return
    # Agrupado por jornada: los huecos se concentran en cinco dias y esa
    # es la lectura, no el detalle de cada uno.
    por = {}
    for r in filas:
        d = r["dia"].strftime("%d/%m")
        x = por.setdefault(d, {"n": 0, "perd": 0, "min": 0.0})
        x["n"] += 1; x["perd"] += max(0, r["perd"]); x["min"] += r["seg"] / 60
    dd = list(por)
    total = sum(v["perd"] for v in por.values())
    peor = max(por, key=lambda d: por[d]["perd"])

    grafica("Huecos en la serie, por jornada",
            f"En total {total} tramas no recibidas en {len(filas)} huecos. La mayoría son "
            f"del {peor}, el día que monté el sistema con el nodo publicando cada 10 s. "
            f"Ninguno de estos huecos dejó al cultivo sin regar.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": {"left": 62, "right": 90, "top": 34, "bottom": 30},
             "xAxis": {**EJE, "type": "value", "name": "tramas / minutos"},
             "yAxis": {**EJE, "type": "category", "data": dd[::-1]},
             "series": [
                 {"name": "Tramas no recibidas", "type": "bar",
                  "data": [por[d]["perd"] for d in dd][::-1],
                  "itemStyle": {"color": ROJO},
                  "label": {"show": True, "position": "right", "fontSize": 10}},
                 {"name": "Minutos sin telemetría", "type": "bar",
                  "data": [round(por[d]["min"], 1) for d in dd][::-1],
                  "itemStyle": {"color": GRIS}},
             ]}, 300)


def g_latencia(cur, dias):
    filas = q(cur, """
        SELECT EXTRACT(EPOCH FROM (created_at - t_rx))*1000 ms
        FROM telemetria_real
        WHERE origen = 'directo' AND created_at > t_rx
          AND EXTRACT(EPOCH FROM (created_at - t_rx)) < 60
          AND t_rx > now() - (%s || ' days')::interval
    """, (dias,))
    v = sorted(float(r["ms"]) for r in filas)
    if not v:
        return
    # Histograma a mano: 30 cubos entre el minimo y el p99, para que una
    # cola larga no aplaste el resto.
    lo, hi = v[0], v[int(len(v) * .99)]
    ncub, ancho = 30, max(1e-9, (hi - lo) / 30)
    cubos = [0] * ncub
    for x in v:
        cubos[min(ncub - 1, int((x - lo) / ancho))] += 1
    et = [f"{lo + i * ancho:.0f}" for i in range(ncub)]
    p50, p95 = v[len(v) // 2], v[int(len(v) * .95)]
    sobre = 100 * sum(1 for x in v if x > 1500) / len(v)

    grafica("Latencia de subida a la nube",
            f"Lo que tarda una trama desde que el gateway la recibe hasta que queda guardada "
            f"en la nube, sobre {len(v)} envíos. La mediana está en {p50:.0f} ms y el 95 % "
            f"por debajo de {p95:.0f} ms, muy holgado frente al objetivo de 1500 ms. Hay una "
            f"cola: el {sobre:.1f} % lo pasa, y son los arranques en frío de la base "
            f"serverless, no el enlace. No cuento aquí las tramas que se recuperan del "
            f"buffer, que tardan lo que durase el corte.",
            {"tooltip": {**TIP, "trigger": "axis"},
             "grid": {"left": 58, "right": 24, "top": 24, "bottom": 46},
             "xAxis": {**EJE, "type": "category", "data": et, "name": "ms",
                       "nameLocation": "middle", "nameGap": 28,
                       "axisLabel": {**EJE["axisLabel"], "interval": 3}},
             "yAxis": {**EJE, "type": "value", "name": "tramas"},
             "series": [{"name": "Tramas", "type": "bar", "data": cubos,
                         "itemStyle": {"color": AZUL}}]}, 300)


# ═════════════════════════════════════════════════════════════
#  PARTE 2 · Los objetivos
# ═════════════════════════════════════════════════════════════

def g_obj1(cur):
    r = q(cur, """
        SELECT COUNT(temperatura) temp, COUNT(humedad_ambiente) hum,
               COUNT(humedad_suelo) suelo, COUNT(ec) ec,
               COUNT(*) FILTER (WHERE ph > 0) ph
        FROM telemetria_real
    """)[0]
    act = q(cur, """
        SELECT CASE evento
                 WHEN 'riego_hidroponia_inicio' THEN 'Riego abierto'
                 WHEN 'riego_hidroponia_fin'    THEN 'Riego cerrado'
                 WHEN 'conectado'               THEN 'Nodo enlazado'
                 WHEN 'desconectado'            THEN 'Nodo caído'
               END etiqueta, COUNT(*) n
        FROM node_eventos
        WHERE evento IN ('riego_hidroponia_inicio', 'riego_hidroponia_fin',
                         'conectado', 'desconectado')
        GROUP BY 1 ORDER BY 2
    """)
    nombres = ["Temperatura", "Humedad del aire", "Humedad del sustrato",
               "Conductividad", "pH"]
    vals = [r["temp"], r["hum"], r["suelo"], r["ec"], r["ph"]]
    # El pH en rojo: no es una medida, son valores del simulador.
    datos = [{"value": v, "itemStyle": {"color": ROJO if i == 4 else VERDE}}
             for i, v in enumerate(vals)]

    grafica("Objetivo 1 · Sensores y actuadores del prototipo",
            "Cuatro de las cinco variables están medidas de verdad sobre todo el histórico. "
            "El pH no: esa barra roja son valores del simulador de los dos primeros días, "
            "porque la sonda nunca llegó a instalarse y hay que decirlo. A la derecha, lo "
            "que el nodo ha accionado y registrado por su cuenta: cada apertura y cierre "
            "de la bomba hidropónica queda anotada con su hora.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "grid": [{"left": 130, "right": "56%", "top": 34, "bottom": 40},
                      {"left": "52%", "right": 40, "top": 34, "bottom": 40}],
             "title": [{"text": "Lecturas registradas", "left": 130, "top": 2,
                        "textStyle": {"fontSize": 11, "fontWeight": "normal", "color": "#55554f"}},
                       {"text": "Sucesos registrados por el nodo", "left": "52%", "top": 2,
                        "textStyle": {"fontSize": 11, "fontWeight": "normal", "color": "#55554f"}}],
             "xAxis": [{**EJE, "type": "value", "gridIndex": 0},
                       {**EJE, "type": "value", "gridIndex": 1}],
             "yAxis": [{**EJE, "type": "category", "data": nombres[::-1], "gridIndex": 0},
                       {**EJE, "type": "category", "gridIndex": 1,
                        "data": [a["etiqueta"] for a in act]}],
             "series": [
                 {"type": "bar", "data": datos[::-1], "name": "Lecturas",
                  "label": {"show": True, "position": "right", "fontSize": 10}},
                 {"type": "bar", "xAxisIndex": 1, "yAxisIndex": 1, "name": "Veces",
                  "data": [a["n"] for a in act], "itemStyle": {"color": AZUL},
                  "label": {"show": True, "position": "right", "fontSize": 10}},
             ]}, 300)


def g_obj2(cur):
    filas = q(cur, f"""
        SELECT sensor_id, date_trunc('hour', t_rx AT TIME ZONE '{ZONA}') h, COUNT(*) n
        FROM telemetria_indoor
        WHERE t_rx > now() - interval '36 hours'
        GROUP BY 1, 2 ORDER BY 2
    """)
    if not filas:
        return
    nodos = sorted({r["sensor_id"] for r in filas})
    horas = sorted({r["h"] for r in filas})
    idx = {h: i for i, h in enumerate(horas)}
    series = []
    for i, nodo in enumerate(nodos):
        serie = [0] * len(horas)
        for r in filas:
            if r["sensor_id"] == nodo:
                serie[idx[r["h"]]] = r["n"]
        etiqueta = nodo + (" · simulado" if nodo.endswith(".002") else " · cultivo real")
        series.append({"name": etiqueta, "type": "bar", "stack": "n", "data": serie,
                       "itemStyle": {"color": [AZUL, NARANJA][i % 2]}})

    grafica("Objetivo 2 · Los dos nodos publicando por MQTT",
            "Los dos ESP32 asociados al mismo punto de acceso, publicando contra el broker "
            "de la Raspberry. El apilado enseña que ninguno le quita sitio al otro: cada "
            "uno mantiene su cadencia. El segundo genera sus datos, y por eso va marcado "
            "aparte en la base.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": {"left": 58, "right": 24, "top": 36, "bottom": 60},
             "xAxis": {**EJE, "type": "category",
                       "data": [h.strftime("%d/%m %Hh") for h in horas],
                       "axisLabel": {**EJE["axisLabel"], "rotate": 45}},
             "yAxis": {**EJE, "type": "value", "name": "tramas/hora"},
             "series": series}, 320)


def g_obj3(cur, dias):
    # El reparto backfill/directo NO sirve aqui: casi todo el backfill es la
    # carga historica de los 18 dias que el gateway acumulo antes de que la
    # nube existiera. Los cortes de verdad se ven en la edad de la trama al
    # llegar, y esos si van marcados como 'directo'.
    filas = q(cur, f"""
        SELECT (t_rx AT TIME ZONE '{ZONA}')::date d,
               COUNT(*) FILTER (WHERE created_at - t_rx >  interval '60 s') buf,
               COUNT(*) FILTER (WHERE created_at - t_rx <= interval '60 s') vivo,
               MAX(EXTRACT(EPOCH FROM (created_at - t_rx))) / 60 espera
        FROM telemetria_real
        WHERE origen = 'directo'
        GROUP BY 1 ORDER BY 1
    """)
    historico = q(cur, "SELECT COUNT(*) n FROM telemetria_real WHERE origen='backfill'")[0]["n"]
    if not filas:
        return
    et = [r["d"].strftime("%d/%m") for r in filas]
    buf = [r["buf"] for r in filas]
    espera = [f(r["espera"] or 0, 1) if r["buf"] else 0 for r in filas]
    dias_corte = [r["d"].strftime("%d/%m") for r in filas if r["buf"]]

    grafica("Objetivo 3 · El gateway aguantando sin nube",
            f"Arriba, cada día desde que la nube está en marcha: en azul lo que subió al "
            f"momento y en verde lo que había quedado esperando en el SQLite del gateway. "
            f"Abajo, cuánto llegó a esperar la trama más vieja de ese día. Solo hay dos días "
            f"con retención ({' y '.join(dias_corte)}), y el segundo es el corte de 21 "
            f"minutos que provoqué a propósito: {sum(buf)} tramas retenidas más de un "
            f"minuto y ninguna perdida. Aparte de esto, el gateway ya había subido "
            f"{mil(historico)} tramas de golpe la primera vez que se conectó — los 18 días "
            f"que llevaba midiendo antes de que hubiera nube a la que hablarle.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": [{"left": 62, "right": 24, "top": 34, "height": 130},
                      {"left": 62, "right": 24, "top": 200, "height": 110}],
             "xAxis": [{**EJE, "type": "category", "data": et, "gridIndex": 0,
                        "axisLabel": {"show": False}},
                       {**EJE, "type": "category", "data": et, "gridIndex": 1}],
             "yAxis": [{**EJE, "type": "value", "name": "tramas/día", "gridIndex": 0},
                       {**EJE, "type": "value", "name": "espera (min)", "gridIndex": 1}],
             "series": [
                 {"name": "Subido en vivo", "type": "bar", "stack": "o",
                  "data": [r["vivo"] for r in filas], "itemStyle": {"color": AZUL}},
                 {"name": "Retenido en el gateway", "type": "bar", "stack": "o",
                  "data": buf, "itemStyle": {"color": VERDE}},
                 {"name": "Espera máxima", "type": "bar", "xAxisIndex": 1, "yAxisIndex": 1,
                  "barWidth": "35%", "itemStyle": {"color": VERDE},
                  "data": [{"value": v,
                            "label": {"show": bool(v), "position": "top", "fontSize": 10,
                                      "color": "#55554f", "formatter": f"{v:g} min"}}
                           for v in espera]},
             ]}, 400)


def g_obj4(cur, dias):
    filas = q(cur, f"""
        SELECT date_trunc('hour', t_rx AT TIME ZONE '{ZONA}') h,
               percentile_cont(.5)  WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (created_at - t_rx))*1000) p50,
               percentile_cont(.95) WITHIN GROUP (
                   ORDER BY EXTRACT(EPOCH FROM (created_at - t_rx))*1000) p95,
               COUNT(*) n
        FROM telemetria_real
        WHERE origen = 'directo' AND created_at > t_rx
          AND EXTRACT(EPOCH FROM (created_at - t_rx)) < 60
          AND t_rx > now() - (%s || ' days')::interval
        GROUP BY 1 ORDER BY 1
    """, (dias,))
    if not filas:
        return
    et = [r["h"].strftime("%d/%m %Hh") for r in filas]
    p50 = [f(r["p50"]) for r in filas]
    p95 = [f(r["p95"]) for r in filas]
    tip = sum(x for x in p50 if x) / max(1, len([x for x in p50 if x]))
    picos = sum(1 for x in p95 if x and x > 1500)

    grafica("Objetivo 4 · El servicio remoto respondiendo",
            f"Cada hora contra la API en la nube, con autenticación y escritura en "
            f"PostgreSQL incluidas. La línea llena es la latencia típica de esa hora y se "
            f"mantiene plana en torno a {tip:.0f} ms toda la serie. La punteada es el peor "
            f"5 % de cada hora, y ahí sí se ven {picos} horas cruzando los 1500 ms: son los "
            f"despertares en frío de la base serverless, que no dependen del sistema. El eje "
            f"va en escala logarítmica porque si no, un solo pico aplasta todo lo demás.",
            {"tooltip": {**TIP, "trigger": "axis"},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": [{"left": 58, "right": 24, "top": 34, "height": 140},
                      {"left": 58, "right": 24, "top": 210, "height": 80}],
             "xAxis": [{**EJE, "type": "category", "data": et, "gridIndex": 0,
                        "axisLabel": {"show": False}},
                       {**EJE, "type": "category", "data": et, "gridIndex": 1,
                        "axisLabel": {**EJE["axisLabel"], "rotate": 45, "interval": "auto"}}],
             # Escala logaritmica: un solo pico de 18 s deja la linea que
             # importa pegada al suelo si el eje es lineal.
             "yAxis": [{**EJE, "type": "log", "name": "ms", "min": 100,
                        "gridIndex": 0},
                       {**EJE, "type": "value", "name": "tramas/h", "gridIndex": 1}],
             "series": [
                 {"name": "Peor 5 % de la hora", "type": "line", "data": p95,
                  "symbol": "none", "smooth": True, "itemStyle": {"color": NARANJA},
                  "lineStyle": {"color": NARANJA, "width": 1.4, "type": "dashed"},
                  "markLine": marca_umbral(1500, "objetivo 1500 ms")},
                 {"name": "Latencia típica", "type": "line", "data": p50, "symbol": "none",
                  "smooth": True, "itemStyle": {"color": AZUL},
                  "lineStyle": {"color": AZUL, "width": 2},
                  "areaStyle": {"color": "rgba(42,120,214,.16)"}},
                 {"name": "Volumen", "type": "bar", "xAxisIndex": 1, "yAxisIndex": 1,
                  "data": [r["n"] for r in filas], "itemStyle": {"color": GRIS}},
             ]}, 390)


def g_obj5(cur):
    # Los cuatro cortes se provocaron a mano el 30/08 por la tarde. El
    # recuento de perdidas viene del cuaderno de la prueba; la escalera de
    # la derecha se lee de la base, que es donde quedo la evidencia.
    cortes = ["Nodo apagado\n3 min", "Sin internet\n21 min",
              "Gateway sin luz\n6 min", "Apagón total\n8 min"]
    perdidas, retenidas = [1, 0, 2, 2], [0, 5, 0, 0]
    esc = [(r["t"], f(r["min"], 1)) for r in q(cur, f"""
        SELECT to_char(t_rx AT TIME ZONE '{ZONA}', 'HH24:MI') t,
               EXTRACT(EPOCH FROM (created_at - t_rx)) / 60 min
        FROM telemetria_real
        WHERE origen = 'directo'
          AND (t_rx AT TIME ZONE '{ZONA}')::date = DATE '2026-08-30'
          AND (t_rx AT TIME ZONE '{ZONA}')::time BETWEEN '18:15' AND '18:45'
        ORDER BY t_rx
    """)]
    if not esc:
        return
    retenidas[1] = len(esc)

    grafica("Objetivo 5 · Pérdida segura durante caídas del enlace WAN",
            f"Perder internet no me costó ni una trama: las {len(esc)} que el nodo publicó "
            f"durante el corte quedaron en el buffer del gateway y subieron enteras al "
            f"volver el cable. La escalera de la derecha es cada una esperando su turno: la "
            f"primera aguantó {esc[0][1]:.1f} minutos y la última entró casi al vuelo. "
            f"Perder el gateway sí cuesta datos, porque el nodo publica en QoS 0 y no "
            f"guarda nada para después — esa es la frontera que el diseño no cubre.",
            {"tooltip": {**TIP, "trigger": "axis", "axisPointer": {"type": "shadow"}},
             "legend": {"top": 0, "textStyle": {"fontSize": 11}},
             "grid": [{"left": 58, "right": "56%", "top": 40, "bottom": 56},
                      {"left": "52%", "right": 30, "top": 40, "bottom": 56}],
             "title": [{"text": "Las cuatro pruebas de corte", "left": 58, "top": 18,
                        "textStyle": {"fontSize": 11, "fontWeight": "normal", "color": "#55554f"}},
                       {"text": "El buffer vaciándose al volver la red", "left": "52%", "top": 18,
                        "textStyle": {"fontSize": 11, "fontWeight": "normal", "color": "#55554f"}}],
             "xAxis": [{**EJE, "type": "category", "data": cortes, "gridIndex": 0,
                        "axisLabel": {**EJE["axisLabel"], "fontSize": 9, "interval": 0}},
                       {**EJE, "type": "category", "data": [e[0] for e in esc], "gridIndex": 1}],
             "yAxis": [{**EJE, "type": "value", "name": "tramas", "gridIndex": 0},
                       {**EJE, "type": "value", "name": "min esperando", "gridIndex": 1}],
             "series": [
                 {"name": "Perdidas", "type": "bar", "stack": "p", "data": perdidas,
                  "itemStyle": {"color": ROJO}},
                 {"name": "Retenidas y recuperadas", "type": "bar", "stack": "p",
                  "data": retenidas, "itemStyle": {"color": VERDE}},
                 {"name": "Espera", "type": "bar", "xAxisIndex": 1, "yAxisIndex": 1,
                  "data": [e[1] for e in esc], "itemStyle": {"color": VERDE},
                  "label": {"show": True, "position": "top", "fontSize": 10}},
             ]}, 330)


# ── HTML ─────────────────────────────────────────────────────

PLANTILLA = """<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VitalCrop AGW — Gráficas</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.6.0/echarts.min.js"></script>
<script>window.echarts || document.write('<scr'+'ipt src="https://cdn.jsdelivr.net/npm/'
  + 'echarts@5.6.0/dist/echarts.min.js"><\/scr'+'ipt>');</script>
<style>
 body { font-family: system-ui, "Segoe UI", sans-serif; max-width: 980px;
        margin: 0 auto; padding: 30px 18px 60px; color: #1c1c1a;
        background: #fff; line-height: 1.55; }
 h1 { font-size: 1.7rem; margin: 0 0 4px; }
 h2 { font-size: 1.25rem; margin: 46px 0 4px; padding-bottom: 6px;
      border-bottom: 2px solid #1c1c1a; }
 h3 { font-size: 1.03rem; margin: 32px 0 6px; }
 p  { margin: 0 0 10px; max-width: 76ch; }
 .meta { color: #6b6b66; font-size: .86rem; margin-bottom: 26px; }
 .baj  { color: #55554f; font-size: .93rem; }
 .txt  { color: #3d3d38; font-size: .93rem; }
 .g    { border: 1px solid #e6e6e2; border-radius: 4px; margin: 10px 0 6px; }
</style></head><body>
<h1>VitalCrop AGW — Gráficas del proyecto</h1>
<p class="meta">Generado el __FECHA__ · __N__ gráficas · leídas de la base de producción</p>
__CUERPO__
<script>
const G = __DATOS__;
if (!window.echarts) {
  // Sin la libreria no hay nada que pintar. Mejor decirlo que dejar
  // diez rectangulos vacios y que parezca que no hay datos.
  document.querySelectorAll(".g").forEach(d => d.innerHTML =
    '<p style="padding:16px;color:#d03b3b">No se pudo cargar ECharts. ' +
    'Este archivo necesita conexión la primera vez que se abre.</p>');
} else {
  G.forEach(g => {
    const ch = echarts.init(document.getElementById(g.id));
    ch.setOption(g.option);
    addEventListener("resize", () => ch.resize());
  });
}
</script>
</body></html>
"""


def escribir(salida):
    partes, datos = [], []
    for i, b in enumerate(BLOQUES):
        if "seccion" in b:
            partes.append(f'<h2>{b["seccion"]}</h2>')
            if b["bajada"]:
                partes.append(f'<p class="baj">{b["bajada"]}</p>')
            continue
        gid = f"g{i}"
        partes.append(f'<h3>{b["titulo"]}</h3>'
                      f'<p class="txt">{b["texto"]}</p>'
                      f'<div class="g" id="{gid}" style="height:{b["alto"]}px"></div>')
        datos.append({"id": gid, "option": b["option"]})

    n = len(datos)
    html = (PLANTILLA
            .replace("__FECHA__", datetime.now().strftime("%d/%m/%Y %H:%M"))
            .replace("__N__", str(n))
            .replace("__CUERPO__", "\n".join(partes))
            .replace("__DATOS__", json.dumps(datos, ensure_ascii=False)))
    Path(salida).write_text(html, encoding="utf-8")
    return n


def main():
    ap = argparse.ArgumentParser(description="Graficas del proyecto VitalCrop AGW")
    ap.add_argument("--salida", default=str(Path(__file__).parent / "graficas.html"))
    ap.add_argument("--dias", type=int, default=25, help="ventana de analisis")
    args = ap.parse_args()

    print("Conectando a la base...")
    con = conectar()
    cur = con.cursor()

    seccion("Parte 1 · Métricas de conexión",
            "El enlace entre el nodo, el gateway y la nube, medido con el cultivo "
            "funcionando.")
    g_balance(cur, args.dias)
    g_rssi(cur, args.dias)
    g_perfil(cur, args.dias)
    g_huecos(cur)
    g_latencia(cur, args.dias)

    seccion("Parte 2 · Los objetivos del proyecto",
            "Una gráfica por objetivo, con el dato que lo respalda.")
    g_obj1(cur)
    g_obj2(cur)
    g_obj3(cur, args.dias)
    g_obj4(cur, args.dias)
    g_obj5(cur)

    con.close()
    n = escribir(args.salida)
    print(f"\nListo: {args.salida}  ({n} gráficas)")


if __name__ == "__main__":
    main()
