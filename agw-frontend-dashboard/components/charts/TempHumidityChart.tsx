'use client';
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { TelemetryData } from '@/hooks/useTelemetry';
import { format } from 'date-fns';

interface Props {
  data: TelemetryData[];
}

export default function TempHumidityChart({ data }: Props) {
  const option = useMemo(() => {
    if (!data.length) return {};

    const times = data.map((d) => format(new Date(d.timestamp), 'HH:mm:ss'));
    const temps = data.map((d) => d.temperature);
    const humids = data.map((d) => d.humidity);

    return {
      color: ['#8b5cf6', '#06b6d4'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' }
      },
      legend: {
        data: ['Temperature (°C)', 'Humidity (%)'],
        textStyle: { color: '#94a3b8' }
      },
      grid: {
        left: '3%', right: '4%', bottom: '3%', containLabel: true
      },
      xAxis: [
        {
          type: 'category',
          boundaryGap: false,
          data: times,
          axisLine: { lineStyle: { color: '#334155' } },
          axisLabel: { color: '#64748b' }
        }
      ],
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
          axisLabel: { color: '#64748b' }
        }
      ],
      series: [
        {
          name: 'Humidity (%)',
          type: 'line',
          stack: 'Total',
          smooth: true,
          lineStyle: { width: 0 },
          showSymbol: false,
          areaStyle: {
            opacity: 0.8,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(6, 182, 212, 1)' }, // Cyan
              { offset: 1, color: 'rgba(6, 182, 212, 0.1)' }
            ])
          },
          emphasis: { focus: 'series' },
          data: humids
        },
        {
          name: 'Temperature (°C)',
          type: 'line',
          stack: 'Total',
          smooth: true,
          lineStyle: { width: 0 },
          showSymbol: false,
          areaStyle: {
            opacity: 0.8,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(139, 92, 246, 1)' }, // Purple
              { offset: 1, color: 'rgba(236, 72, 153, 0.3)' } // Pink fade
            ])
          },
          emphasis: { focus: 'series' },
          data: temps
        }
      ]
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: '350px', width: '100%' }} theme="dark" opts={{ renderer: 'canvas' }} />;
}
