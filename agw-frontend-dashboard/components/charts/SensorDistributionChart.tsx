'use client';
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TelemetryData } from '@/hooks/useTelemetry';

interface Props {
  data: TelemetryData[];
}

// Simple boxplot data transform helper since we aren't importing the full echarts stat tools here
function getBoxplotData(values: number[]) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return [min, q1, median, q3, max];
}

export default function SensorDistributionChart({ data }: Props) {
  const option = useMemo(() => {
    if (!data.length) return {};

    // For a real scenario, this would group by day/week. Here, just to show the structure, 
    // we split data artificially into two chunks (earlier vs later) or just one overall box.
    const mid = Math.floor(data.length / 2);
    const earlier = data.slice(0, mid);
    const later = data.slice(mid);

    const bpData = [
      getBoxplotData(earlier.map(d => d.temperature)),
      getBoxplotData(later.map(d => d.temperature))
    ];

    return {
      tooltip: {
        trigger: 'item',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' }
      },
      grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
      xAxis: {
        type: 'category',
        data: ['Previous Range', 'Recent Range'],
        boundaryGap: true,
        nameGap: 30,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'value',
        name: 'Temperature (°C)',
        splitArea: { show: true, areaStyle: { color: ['rgba(250,250,250,0.01)', 'rgba(200,200,200,0.01)'] } },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLabel: { color: '#64748b' }
      },
      series: [
        {
          name: 'boxplot',
          type: 'boxplot',
          data: bpData,
          itemStyle: {
            color: '#3b82f6',
            borderColor: '#60a5fa',
            borderWidth: 2
          },
          tooltip: {
            formatter: (param: any) => {
              return [
                'Range: ' + param.name + '<br/>',
                'Max: ' + param.data[5].toFixed(2) + '<br/>',
                'Q3: ' + param.data[4].toFixed(2) + '<br/>',
                'Median: ' + param.data[3].toFixed(2) + '<br/>',
                'Q1: ' + param.data[2].toFixed(2) + '<br/>',
                'Min: ' + param.data[1].toFixed(2) + '<br/>'
              ].join('');
            }
          }
        }
      ]
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: '350px', width: '100%' }} />;
}
