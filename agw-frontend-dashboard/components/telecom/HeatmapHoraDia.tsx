'use client';

/**
 * Mapa de calor hora x día.
 *
 * Es la gráfica que descubrió que el RSSI mejora 8 dB entre las 14h y
 * las 17h de forma sistemática. Una serie temporal no lo habría
 * mostrado: 31.000 puntos seguidos tapan un patrón que solo aparece al
 * plegar el tiempo sobre sí mismo.
 *
 * El eje X son las 24 horas y el Y los días, de modo que una banda
 * vertical significa "pasa a esa hora todos los días" y una franja
 * horizontal, "pasó ese día entero".
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { CeldaHeatmap } from '@/hooks/useTelecom';

interface Props {
  celdas: CeldaHeatmap[];
  min: number;
  max: number;
  unidad?: string;
  /** Invertir la escala: en RSSI, más negativo es peor. */
  invertir?: boolean;
  alto?: number;
}

export default function HeatmapHoraDia({
  celdas, min, max, unidad = 'dBm', invertir = false, alto = 380,
}: Props) {
  const option = useMemo(() => {
    if (!celdas?.length) return {};

    const dias = Array.from(new Set(celdas.map((c) => c.dia))).sort();
    const horas = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}h`);

    const datos = celdas
      .filter((c) => c.valor !== null)
      .map((c) => [c.hora, dias.indexOf(c.dia), c.valor as number, c.muestras]);

    return {
      tooltip: {
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (p: any) => {
          const [h, d, v, n] = p.data;
          return `<b>${dias[d]}</b> · ${String(h).padStart(2, '0')}:00<br/>` +
                 `${v} ${unidad}<br/>` +
                 `<span style="color:#94a3b8">${n} muestras</span>`;
        },
      },
      grid: { left: 88, right: 24, top: 12, bottom: 56 },
      xAxis: {
        type: 'category',
        data: horas,
        splitArea: { show: true },
        axisLabel: { color: '#64748B', fontSize: 10, interval: 1 },
        axisLine: { lineStyle: { color: '#1F2D45' } },
      },
      yAxis: {
        type: 'category',
        data: dias.map((d) => d.slice(5)),   // MM-DD, el año no aporta
        splitArea: { show: true },
        axisLabel: { color: '#64748B', fontSize: 10 },
        axisLine: { lineStyle: { color: '#1F2D45' } },
      },
      visualMap: {
        min, max,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        textStyle: { color: '#94A3B8', fontSize: 10 },
        // Verde = bueno. Con RSSI hay que invertir, porque el máximo
        // (menos negativo) es la señal fuerte.
        inRange: {
          color: invertir
            ? ['#EF4444', '#F59E0B', '#10B981']
            : ['#10B981', '#F59E0B', '#EF4444'],
        },
      },
      series: [{
        type: 'heatmap',
        data: datos,
        emphasis: { itemStyle: { borderColor: '#F1F5F9', borderWidth: 1 } },
        progressive: 1000,
        itemStyle: { borderColor: '#0A0F1E', borderWidth: 0.5 },
      }],
    };
  }, [celdas, min, max, unidad, invertir]);

  if (!celdas?.length) {
    return <p className="text-text-muted text-sm py-8 text-center">Sin datos en la ventana</p>;
  }

  return <ReactECharts option={option} style={{ height: alto }} notMerge />;
}
