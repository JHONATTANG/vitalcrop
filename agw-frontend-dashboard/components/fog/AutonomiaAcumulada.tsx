'use client';

/**
 * Cuánto llevaba acumulado el borde, día a día.
 *
 * La cifra de autonomía del panel —"18 días sin nube, 31.781 tramas"—
 * es un número final y no enseña la forma de la curva. Aquí se ve que
 * el buffer no creció de golpe: fue acumulando a ritmo constante
 * durante dos semanas y medias mientras nadie miraba, que es
 * exactamente lo que se le pedía al nodo fog.
 *
 * La curva es acumulada y no diaria a propósito. Las barras diarias
 * responden "cuánto ese día"; esta responde "cuánto habría perdido si
 * el buffer no hubiera existido", que es la pregunta que justifica el
 * diseño. La sombra bajo la línea es el volumen retenido.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  COLORES, TOOLTIP, EJE_BASE, LEYENDA, areaDegradado, sombra, zoom,
} from '@/components/charts/tema';
import type { DiaBalance } from '@/hooks/useTelecom';

interface Props {
  dias: DiaBalance[];
  /** Instante en que se encendió la subida a la nube. */
  desdeNube?: string | null;
  alto?: number;
}

export default function AutonomiaAcumulada({ dias, desdeNube = null, alto = 330 }: Props) {
  const option = useMemo(() => {
    const etiquetas = dias.map((d) =>
      new Date(d.dia).toLocaleDateString('es', { day: '2-digit', month: 'short' }));

    let suma = 0;
    const acumulado = dias.map((d) => (suma += d.tramas));

    const corte = desdeNube ? new Date(desdeNube) : null;
    const marca = corte
      ? dias.findIndex((d) => new Date(d.dia) >= new Date(corte.toDateString()))
      : -1;

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 34, bottom: 44, containLabel: true },
      legend: { ...LEYENDA },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        axisPointer: { type: 'line' as const, lineStyle: { color: COLORES.textoTenue, type: 'dashed' as const } },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const i = ps[0]?.dataIndex ?? 0;
          const d = dias[i];
          if (!d) return '';
          const fila = (k: string, v: string, c: string = COLORES.texto) =>
            `<div style="display:flex;gap:14px;justify-content:space-between">
               <span style="color:${COLORES.textoSec}">${k}</span>
               <b style="color:${c};font-variant-numeric:tabular-nums">${v}</b></div>`;
          return `<div style="font-weight:600;margin-bottom:5px">
                    ${new Date(d.dia).toLocaleDateString('es', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>`
            + fila('Acumulado en el borde', acumulado[i].toLocaleString(), COLORES.violeta)
            + fila('Generadas ese día', d.tramas.toLocaleString(), COLORES.verde)
            + fila('Ciclos de riego decididos', String(d.ciclos_riego), COLORES.cian)
            + fila('Reinicios superados', String(d.reinicios), d.reinicios ? COLORES.ambar : COLORES.textoTenue);
        },
      },
      xAxis: {
        type: 'category' as const, data: etiquetas, boundaryGap: false,
        ...EJE_BASE, splitLine: { show: false },
        axisLabel: { ...EJE_BASE.axisLabel, hideOverlap: true },
      },
      yAxis: [
        { type: 'value' as const, name: 'tramas acumuladas',
          nameTextStyle: { color: COLORES.textoTenue, fontSize: 10 }, ...EJE_BASE },
        { type: 'value' as const, name: 'por día',
          nameTextStyle: { color: COLORES.textoTenue, fontSize: 10 },
          ...EJE_BASE, splitLine: { show: false } },
      ],
      dataZoom: zoom(0),
      series: [
        {
          name: 'Retenido en el borde (acumulado)',
          type: 'line' as const,
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2.4, color: COLORES.violeta },
          itemStyle: { color: COLORES.violeta },
          // La sombra es el argumento visual del gráfico: el área bajo
          // la curva es literalmente el dato que no se perdió.
          areaStyle: areaDegradado(COLORES.violeta, 0.5),
          data: acumulado,
          ...(marca >= 0 ? {
            markLine: {
              silent: true, symbol: 'none',
              lineStyle: { color: COLORES.verde, type: 'dashed' as const, width: 1.5 },
              label: {
                formatter: 'se enciende la subida',
                color: COLORES.verde, fontSize: 9, position: 'insideEndTop' as const,
              },
              data: [{ xAxis: marca }],
            },
          } : {}),
        },
        {
          name: 'Generadas ese día',
          type: 'bar' as const,
          yAxisIndex: 1,
          barMaxWidth: 16,
          itemStyle: { color: sombra(COLORES.verde, 0.45), borderRadius: [2, 2, 0, 0] },
          data: dias.map((d) => d.tramas),
        },
      ],
    };
  }, [dias, desdeNube]);

  if (!dias.length) {
    return <p className="text-text-muted text-sm py-12 text-center">Sin días que acumular</p>;
  }

  return (
    <ReactECharts option={option} style={{ height: alto, width: '100%' }}
      opts={{ renderer: 'canvas' }} notMerge />
  );
}
