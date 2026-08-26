'use client';

/**
 * Serie temporal con banda de mínimo y máximo.
 *
 * La media sola miente sobre un dato agregado: dos buckets con la misma
 * media pueden esconder uno estable y otro oscilando 20 dB. La banda
 * muestra la dispersión real dentro de cada bucket, que en una métrica
 * de enlace es tan informativa como el valor central.
 *
 * Se dibuja como área apilada (mínimo transparente + rango coloreado)
 * porque ECharts no tiene un tipo "banda" nativo.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { format } from 'date-fns';
import type { PuntoSerie } from '@/hooks/useTelecom';

interface Props {
  puntos: PuntoSerie[];
  unidad?: string;
  color?: string;
  umbral?: number;
  alto?: number;
}

export default function SerieBanda({
  puntos, unidad = '', color = '#10B981', umbral, alto = 300,
}: Props) {
  const option = useMemo(() => {
    if (!puntos?.length) return {};

    const t = puntos.map((p) => format(new Date(p.t), 'dd/MM HH:mm'));

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (ps: any[]) => {
          const p = puntos[ps[0].dataIndex];
          return `<b>${t[ps[0].dataIndex]}</b><br/>` +
                 `media ${p.media} ${unidad}<br/>` +
                 `<span style="color:#94a3b8">rango ${p.minimo} a ${p.maximo} · ${p.n} muestras</span>`;
        },
      },
      grid: { left: 52, right: 20, top: 20, bottom: 56 },
      xAxis: {
        type: 'category',
        data: t,
        axisLabel: { color: '#64748B', fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: '#1F2D45' } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1F2D45' } },
      },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 18, bottom: 8, borderColor: '#1F2D45',
          textStyle: { color: '#64748B', fontSize: 9 },
          fillerColor: 'rgba(59,130,246,.15)' },
      ],
      series: [
        {
          name: 'min', type: 'line', stack: 'banda',
          data: puntos.map((p) => p.minimo),
          lineStyle: { opacity: 0 }, symbol: 'none',
          areaStyle: { opacity: 0 },
        },
        {
          name: 'rango', type: 'line', stack: 'banda',
          data: puntos.map((p) => +(p.maximo - p.minimo).toFixed(2)),
          lineStyle: { opacity: 0 }, symbol: 'none',
          areaStyle: { color, opacity: 0.13 },
        },
        {
          name: 'media', type: 'line',
          data: puntos.map((p) => p.media),
          smooth: true, symbol: 'none',
          lineStyle: { color, width: 2 },
          markLine: umbral === undefined ? undefined : {
            silent: true, symbol: 'none',
            data: [{ yAxis: umbral,
              label: { formatter: `objetivo ${umbral}`, color: '#EF4444', fontSize: 10 },
              lineStyle: { color: '#EF4444', type: 'dashed', width: 1.5 } }],
          },
        },
      ],
    };
  }, [puntos, unidad, color, umbral]);

  if (!puntos?.length) {
    return <p className="text-text-muted text-sm py-8 text-center">Sin datos</p>;
  }

  return <ReactECharts option={option} style={{ height: alto }} notMerge />;
}
