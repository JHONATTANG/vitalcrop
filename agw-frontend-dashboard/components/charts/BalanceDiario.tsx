'use client';

/**
 * Un día por columna: qué llegó, qué se perdió y qué hizo el sistema.
 *
 * Es la gráfica que cruza las tres cosas que en el resto del panel van
 * por separado —cobertura del enlace, calidad de la señal y trabajo del
 * cultivo— y las pone sobre el mismo día. Ahí es donde se ven las
 * coincidencias que ninguna serie suelta enseña: que las tramas
 * perdidas se concentran en los días con reinicios, o que un día con
 * mucha bomba no degrada el enlace.
 *
 * Las barras van apiladas (recibidas + perdidas = esperadas) en vez de
 * lado a lado: apiladas, la altura total es la expectativa y el trozo
 * rojo se lee como fracción de ella, que es la pregunta real. Lado a
 * lado obligaría a comparar dos alturas a ojo.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  COLORES, TOOLTIP, EJE_BASE, LEYENDA, areaDegradado, sombra,
} from './tema';
import type { DiaBalance } from '@/hooks/useTelecom';

interface Props {
  dias: DiaBalance[];
  alto?: number;
  /** Objetivo de RSSI del §9, para la línea de referencia. */
  umbralRssi?: number;
}

export default function BalanceDiario({ dias, alto = 360, umbralRssi = -70 }: Props) {
  const option = useMemo(() => {
    const etiquetas = dias.map((d) =>
      new Date(d.dia).toLocaleDateString('es', { day: '2-digit', month: 'short' }));

    // Las esperadas son una estimación a partir del periodo reportado, y
    // en un día con la cadencia cambiada puede quedar por debajo de lo
    // recibido. Recortar a cero evita pintar una "pérdida negativa".
    const perdidas = dias.map((d) => Math.max(0, d.esperadas - d.tramas));

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 38, bottom: 8, containLabel: true },
      legend: { ...LEYENDA },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const, shadowStyle: { color: sombra(COLORES.azul, 0.06) } },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const d = dias[ps[0]?.dataIndex ?? 0];
          if (!d) return '';
          const perd = Math.max(0, d.esperadas - d.tramas);
          const pct = d.esperadas ? (100 * perd / d.esperadas).toFixed(2) : '0';
          const fila = (k: string, v: string, color: string = COLORES.texto) =>
            `<div style="display:flex;gap:14px;justify-content:space-between">
               <span style="color:${COLORES.textoSec}">${k}</span>
               <b style="color:${color};font-variant-numeric:tabular-nums">${v}</b></div>`;
          return `<div style="color:${COLORES.texto};font-weight:600;margin-bottom:5px">
                    ${new Date(d.dia).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>`
            + fila('Tramas recibidas', d.tramas.toLocaleString(), COLORES.verde)
            + fila('Esperadas', d.esperadas.toLocaleString())
            + fila('Perdidas', `${perd} (${pct} %)`, perd ? COLORES.rojo : COLORES.textoTenue)
            + fila('Cadencia', d.periodo_ms ? `${Math.round(d.periodo_ms / 1000)} s` : '—')
            + `<div style="height:6px"></div>`
            + fila('RSSI medio', d.rssi_medio !== null ? `${d.rssi_medio} dBm` : '—', COLORES.azul)
            + fila('RSSI mínimo', d.rssi_min !== null ? `${d.rssi_min} dBm` : '—')
            + fila('Tramas bajo −70', String(d.tramas_rssi_bajo))
            + `<div style="height:6px"></div>`
            + fila('Reinicios del nodo', String(d.reinicios), d.reinicios ? COLORES.ambar : COLORES.textoTenue)
            + fila('Ciclos de riego', String(d.ciclos_riego), COLORES.cian)
            + fila('Minutos de bomba', String(d.min_bomba), COLORES.cian);
        },
      },
      xAxis: {
        type: 'category' as const,
        data: etiquetas,
        ...EJE_BASE,
        splitLine: { show: false },
        axisLabel: { ...EJE_BASE.axisLabel, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value' as const, name: 'tramas',
          nameTextStyle: { color: COLORES.textoTenue, fontSize: 10 },
          ...EJE_BASE,
        },
        {
          type: 'value' as const, name: 'dBm', scale: true,
          nameTextStyle: { color: COLORES.azul, fontSize: 10 },
          ...EJE_BASE,
          splitLine: { show: false },
          axisLabel: { ...EJE_BASE.axisLabel, color: COLORES.azul },
        },
      ],
      series: [
        {
          name: 'Tramas recibidas',
          type: 'bar' as const,
          stack: 'cobertura',
          barMaxWidth: 26,
          itemStyle: { color: sombra(COLORES.verde, 0.75), borderRadius: [0, 0, 2, 2] },
          data: dias.map((d) => d.tramas),
        },
        {
          name: 'Tramas perdidas',
          type: 'bar' as const,
          stack: 'cobertura',
          barMaxWidth: 26,
          itemStyle: { color: COLORES.rojo, borderRadius: [2, 2, 0, 0] },
          data: perdidas,
        },
        {
          name: 'Minutos de bomba',
          type: 'bar' as const,
          barMaxWidth: 10,
          barGap: '-40%',
          itemStyle: { color: sombra(COLORES.cian, 0.55), borderRadius: [2, 2, 0, 0] },
          data: dias.map((d) => d.min_bomba),
        },
        {
          name: 'RSSI medio',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: 0.3,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color: COLORES.azul },
          itemStyle: { color: COLORES.azul },
          areaStyle: areaDegradado(COLORES.azul, 0.16),
          data: dias.map((d) => d.rssi_medio),
          markLine: {
            silent: true,
            symbol: 'none',
            label: {
              formatter: `objetivo ${umbralRssi} dBm`,
              color: COLORES.textoTenue, fontSize: 9, position: 'insideEndTop' as const,
            },
            lineStyle: { color: COLORES.ambar, type: 'dashed' as const, width: 1 },
            data: [{ yAxis: umbralRssi }],
          },
        },
        {
          name: 'Reinicios del nodo',
          type: 'scatter' as const,
          yAxisIndex: 1,
          // Solo se dibuja el punto en los días que hubo reinicio: un
          // cero pintado en la línea base se confunde con una medición.
          data: dias.map((d, i) => (d.reinicios > 0 ? [i, d.rssi_medio] : null)),
          symbol: 'triangle',
          symbolSize: (v: unknown) => {
            const i = Array.isArray(v) ? (v[0] as number) : 0;
            return 9 + 3 * Math.min(3, dias[i]?.reinicios ?? 0);
          },
          itemStyle: { color: COLORES.ambar, borderColor: COLORES.fondo, borderWidth: 1 },
          tooltip: { show: false },
          z: 5,
        },
      ],
    };
  }, [dias, umbralRssi]);

  if (!dias.length) {
    return <p className="text-text-muted text-sm py-12 text-center">Sin días en la ventana</p>;
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
