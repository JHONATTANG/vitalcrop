'use client';

/**
 * Varias métricas sobre el mismo eje de tiempo, con sombra bajo cada
 * línea.
 *
 * El problema que resuelve no es estético. Temperatura (18-27 °C),
 * humedad (55-96 %), EC (0-900 µS/cm) y RSSI (−87 a −55 dBm) viven en
 * escalas que no se parecen: en un solo eje, la EC aplasta a las demás
 * contra el suelo y no se ve nada. Aquí cada métrica se asigna al eje
 * izquierdo o derecho según su magnitud, y las que no caben en ninguno
 * se normalizan — diciéndolo en el tooltip, que sigue mostrando el
 * valor real con su unidad.
 *
 * El área bajo la línea muere en transparente en vez de ser un relleno
 * plano: con cuatro series superpuestas, cuatro rellenos opacos tapan
 * todo lo que quede detrás del primero.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  COLORES, COLOR_METRICA, ETIQUETA_METRICA, UNIDAD_METRICA,
  TOOLTIP, EJE_BASE, LEYENDA, areaDegradado, sombra, zoom, etiquetaFecha,
} from './tema';
import type { PuntoMultiserie } from '@/hooks/useTelecom';

interface Props {
  puntos: PuntoMultiserie[];
  metricas: string[];
  alto?: number;
  /** Métricas que van al eje derecho. El resto van al izquierdo. */
  ejeDerecho?: string[];
  /** Marca las franjas de oscuridad según el fotoperiodo configurado. */
  fotoperiodo?: { on: number; off: number } | null;
}

export default function SerieCompuesta({
  puntos, metricas, alto = 340, ejeDerecho = ['rssi'], fotoperiodo = null,
}: Props) {
  const option = useMemo(() => {
    const tiempos = puntos.map((p) => p.t);

    const series = metricas.map((m) => {
      const color = COLOR_METRICA[m] ?? COLORES.azul;
      const derecha = ejeDerecho.includes(m);
      return {
        name: `${ETIQUETA_METRICA[m] ?? m} (${UNIDAD_METRICA[m] ?? ''})`,
        type: 'line' as const,
        yAxisIndex: derecha ? 1 : 0,
        // `connectNulls: false` es deliberado: un hueco en la rejilla es
        // un corte real de datos y unir los extremos dibujaría una recta
        // atravesando horas en las que no se midió nada.
        connectNulls: false,
        showSymbol: false,
        smooth: 0.25,
        lineStyle: { width: 1.8, color },
        itemStyle: { color },
        areaStyle: areaDegradado(color, 0.3),
        emphasis: { focus: 'series' as const },
        data: puntos.map((p) => (p as unknown as Record<string, unknown>)[m] ?? null),
      };
    });

    // Franjas de noche. El fotoperiodo es lo que más explica de la serie
    // de temperatura, y sin marcarlo hay que adivinar dónde empieza cada
    // ciclo. Se recorren los puntos abriendo una franja al entrar en la
    // oscuridad y cerrándola al salir.
    const franjas: Array<[{ xAxis: string }, { xAxis: string }]> = [];
    if (fotoperiodo) {
      let inicio: string | null = null;
      for (const p of puntos) {
        const h = new Date(p.t).getHours();
        const esNoche = h < fotoperiodo.on || h >= fotoperiodo.off;
        if (esNoche && inicio === null) inicio = p.t;
        if (!esNoche && inicio !== null) {
          franjas.push([{ xAxis: inicio }, { xAxis: p.t }]);
          inicio = null;
        }
      }
      // La ventana puede terminar de noche: se cierra en el último punto.
      if (inicio !== null && puntos.length) {
        franjas.push([{ xAxis: inicio }, { xAxis: puntos[puntos.length - 1].t }]);
      }
    }

    if (franjas.length && series.length) {
      (series[0] as Record<string, unknown>).markArea = {
        silent: true,
        itemStyle: { color: sombra(COLORES.azul, 0.05) },
        data: franjas,
      };
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 34, bottom: 46, containLabel: true },
      legend: { ...LEYENDA, data: series.map((s) => s.name) },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: COLORES.textoTenue, type: 'dashed' as const },
          crossStyle: { color: COLORES.textoTenue },
          label: { backgroundColor: COLORES.fondoAlt, color: COLORES.texto },
        },
        formatter: (ps: Array<{ axisValue: string; marker: string; seriesName: string; value: number | null }>) => {
          const cab = `<div style="color:${COLORES.textoSec};font-size:10px;margin-bottom:4px">
            ${etiquetaFecha(ps[0]?.axisValue ?? '')}</div>`;
          const filas = ps
            .filter((p) => p.value !== null && p.value !== undefined)
            .map((p) => `<div style="display:flex;gap:8px;justify-content:space-between">
                <span>${p.marker}${p.seriesName}</span>
                <b style="font-variant-numeric:tabular-nums">${p.value}</b></div>`)
            .join('');
          return cab + (filas || `<span style="color:${COLORES.textoTenue}">sin datos en este intervalo</span>`);
        },
      },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        data: tiempos,
        ...EJE_BASE,
        splitLine: { show: false },
        axisLabel: {
          ...EJE_BASE.axisLabel,
          formatter: (v: string) => etiquetaFecha(v),
          hideOverlap: true,
        },
      },
      yAxis: [
        { type: 'value' as const, scale: true, ...EJE_BASE },
        {
          type: 'value' as const, scale: true, ...EJE_BASE,
          splitLine: { show: false },
          axisLabel: { ...EJE_BASE.axisLabel, color: COLORES.azul },
        },
      ],
      dataZoom: zoom(60),
      series,
    };
  }, [puntos, metricas, ejeDerecho, fotoperiodo]);

  if (!puntos.length) {
    return (
      <p className="text-text-muted text-sm py-12 text-center">
        Sin datos en la ventana seleccionada
      </p>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: alto, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}
