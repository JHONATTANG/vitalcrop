'use client';
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TelemetryData } from '@/hooks/useTelemetry';
import { format } from 'date-fns';

interface Props {
  data: TelemetryData[];
}

export default function PhChart({ data }: Props) {
  const option = useMemo(() => {
    if (!data.length) return {};

    const times = data.map((d) => format(new Date(d.timestamp), 'HH:mm:ss'));
    const phVals = data.map((d) => d.ph);

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' }
      },
      grid: { left: '3%', right: '4%', bottom: '5%', top: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'value',
        min: 4, max: 8,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: { color: '#64748b' }
      },
      visualMap: {
        type: 'piecewise',
        show: false,
        dimension: 1,
        pieces: [
          { max: 5.5, color: '#ef4444' }, // Red if below 5.5 (Acidic anomaly)
          { min: 5.5, max: 6.5, color: '#10b981' }, // Green (Optimal)
          { min: 6.5, color: '#ef4444' } // Red if above 6.5 (Alkaline anomaly)
        ]
      },
      series: [
        {
          name: 'pH Level',
          type: 'line',
          smooth: true,
          data: phVals,
          markLine: {
            silent: true,
            lineStyle: { color: '#10b981', type: 'dashed', opacity: 0.5 },
            data: [{ yAxis: 5.5 }, { yAxis: 6.5 }]
          }
        }
      ]
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: '300px', width: '100%' }} />;
}
