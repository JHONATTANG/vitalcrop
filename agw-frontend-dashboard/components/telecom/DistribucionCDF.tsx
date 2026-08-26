'use client';

/**
 * Histograma con su acumulada superpuesta.
 *
 * El histograma dice dónde se concentran las lecturas; la CDF responde
 * la pregunta que hace el MCD §9, que es distinta: "¿qué porcentaje del
 * tiempo estuve por debajo del umbral?". Con la CDF eso se lee
 * directamente en el eje derecho, sin sumar barras a ojo.
 *
 * Por eso van juntas y no en dos gráficas: la comparación con el
 * objetivo solo tiene sentido sobre la acumulada.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { BinDistribucion } from '@/hooks/useTelecom';

interface Props {
  bins: BinDistribucion[];
  unidad?: string;
  /** Línea vertical del objetivo del §9, si la métrica tiene uno. */
  umbral?: number;
  etiquetaUmbral?: string;
  alto?: number;
}

export default function DistribucionCDF({
  bins, unidad = 'dBm', umbral, etiquetaUmbral, alto = 340,
}: Props) {
  const option = useMemo(() => {
    if (!bins?.length) return {};

    const etiquetas = bins.map((b) => b.desde.toFixed(0));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (ps: any[]) => {
          const i = ps[0].dataIndex;
          const b = bins[i];
          return `<b>${b.desde} a ${b.hasta} ${unidad}</b><br/>` +
                 `${b.n} muestras · ${b.pct}%<br/>` +
                 `<span style="color:#F59E0B">acumulado ${b.cdf}%</span>`;
        },
      },
      grid: { left: 52, right: 56, top: 24, bottom: 40 },
      xAxis: {
        type: 'category',
        data: etiquetas,
        name: unidad,
        nameTextStyle: { color: '#64748B', fontSize: 10 },
        axisLabel: { color: '#64748B', fontSize: 10, interval: 2 },
        axisLine: { lineStyle: { color: '#1F2D45' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'muestras',
          nameTextStyle: { color: '#64748B', fontSize: 10 },
          axisLabel: { color: '#64748B', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1F2D45' } },
        },
        {
          type: 'value',
          name: 'CDF %',
          min: 0, max: 100,
          nameTextStyle: { color: '#F59E0B', fontSize: 10 },
          axisLabel: { color: '#F59E0B', fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'muestras',
          type: 'bar',
          data: bins.map((b) => b.n),
          itemStyle: { color: '#3B82F6', borderRadius: [2, 2, 0, 0] },
          barCategoryGap: '10%',
        },
        {
          name: 'acumulada',
          type: 'line',
          yAxisIndex: 1,
          data: bins.map((b) => b.cdf),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#F59E0B', width: 2 },
          // La marca del objetivo va sobre la CDF, que es donde se lee.
          markLine: umbral === undefined ? undefined : {
            silent: true,
            symbol: 'none',
            data: [{
              xAxis: bins.findIndex((b) => b.hasta >= umbral),
              label: {
                formatter: etiquetaUmbral ?? `objetivo ${umbral}`,
                color: '#EF4444', fontSize: 10, position: 'insideEndTop',
              },
              lineStyle: { color: '#EF4444', type: 'dashed', width: 1.5 },
            }],
          },
        },
      ],
    };
  }, [bins, unidad, umbral, etiquetaUmbral]);

  if (!bins?.length) {
    return <p className="text-text-muted text-sm py-8 text-center">Sin datos</p>;
  }

  return <ReactECharts option={option} style={{ height: alto }} notMerge />;
}
