'use client';
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TelemetryData } from '@/hooks/useTelemetry';
import { format } from 'date-fns';

interface Props {
  data: TelemetryData[];
}

export default function WateringMoistureChart({ data }: Props) {
  const option = useMemo(() => {
    if (!data.length) return {};

    const times = data.map((d) => format(new Date(d.timestamp), 'HH:mm'));
    const moisture = data.map((d) => d.soil_moisture);
    // Watering could be 1 or 0 for active/inactive, or time duration. We map to 0/1 for simulation.
    const watering = data.map((d) => d.is_watering ? 1 : 0); 

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc' }
      },
      legend: {
        data: ['Soil Moisture', 'Watering Active'],
        textStyle: { color: '#94a3b8' }
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
      dataZoom: [
        {
          type: 'slider',
          show: true,
          xAxisIndex: [0],
          start: 0,
          end: 100,
          handleSize: '100%',
          handleStyle: { color: '#3b82f6', shadowBlur: 3, shadowColor: 'rgba(0, 0, 0, 0.6)', shadowOffsetX: 2, shadowOffsetY: 2 },
          textStyle: { color: '#94a3b8' },
          borderColor: '#1e293b'
        },
        { type: 'inside', xAxisIndex: [0], start: 0, end: 100 }
      ],
      xAxis: [
        {
          type: 'category',
          data: times,
          axisPointer: { type: 'shadow' },
          axisLine: { lineStyle: { color: '#334155' } },
          axisLabel: { color: '#64748b' }
        }
      ],
      yAxis: [
        {
          type: 'value',
          name: 'Moisture (%)',
          min: 0, max: 100,
          nameTextStyle: { color: '#64748b' },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
          axisLabel: { color: '#64748b', formatter: '{value} %' }
        },
        {
          type: 'value',
          name: 'Status',
          min: 0, max: 1.2, // a bit over 1 so bar isn't glued to top
          show: false // hide second y-axis labels
        }
      ],
      series: [
        {
          name: 'Watering Active',
          type: 'bar',
          yAxisIndex: 1,
          itemStyle: { color: '#3b82f6', opacity: 0.3, borderRadius: [4, 4, 0, 0] },
          data: watering
        },
        {
          name: 'Soil Moisture',
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: '#f59e0b' },
          itemStyle: { color: '#f59e0b' },
          areaStyle: { color: 'rgba(245, 158, 11, 0.1)' },
          data: moisture
        }
      ]
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: '350px', width: '100%' }} />;
}
