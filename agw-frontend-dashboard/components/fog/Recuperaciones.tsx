'use client';

/**
 * Cada caída del nodo y lo que tardó en volver, contra el objetivo.
 *
 * El MTTR agregado —103 s— esconde lo único que importa para decidir si
 * el objetivo de 90 s es alcanzable: si esos 103 s son cuatro incidentes
 * parecidos o tres buenos y uno malo. Son lo segundo, y se ve de un
 * vistazo: tres por debajo del objetivo y uno de 168 s que arrastra la
 * media entera.
 *
 * Las barras se colorean contra el objetivo en vez de llevar todas el
 * mismo color, porque la comparación con la línea es el propósito del
 * gráfico y no un detalle.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORES, TOOLTIP, EJE_BASE, sombra } from '@/components/charts/tema';

interface Props {
  detalle: Array<{ caida: string; vuelta: string; segundos: number }>;
  objetivoS: number;
  alto?: number;
}

export default function Recuperaciones({ detalle, objetivoS, alto = 260 }: Props) {
  const option = useMemo(() => {
    // Orden cronológico: la pregunta que sigue a "¿cuánto tarda?" es
    // "¿está mejorando?", y solo se responde si el eje es el tiempo.
    const ord = [...detalle].sort(
      (a, b) => new Date(a.caida).getTime() - new Date(b.caida).getTime());

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const, shadowStyle: { color: sombra(COLORES.azul, 0.06) } },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const d = ord[ps[0]?.dataIndex ?? 0];
          if (!d) return '';
          const f = (iso: string) => new Date(iso).toLocaleString('es', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
          });
          const cumple = d.segundos <= objetivoS;
          return `<div style="font-weight:600;margin-bottom:4px">
                    Recuperación en ${d.segundos} s
                    <span style="color:${cumple ? COLORES.verde : COLORES.ambar};font-size:10px;font-weight:400">
                      · ${cumple ? 'dentro del objetivo' : `${d.segundos - objetivoS} s por encima`}</span>
                  </div>
                  <div style="color:${COLORES.textoSec};font-size:11px">cayó a las ${f(d.caida)}</div>
                  <div style="color:${COLORES.textoSec};font-size:11px">volvió a las ${f(d.vuelta)}</div>`;
        },
      },
      xAxis: {
        type: 'category' as const,
        data: ord.map((d) => new Date(d.caida).toLocaleDateString('es', {
          day: '2-digit', month: '2-digit',
        }) + ' ' + new Date(d.caida).toLocaleTimeString('es', {
          hour: '2-digit', minute: '2-digit',
        })),
        ...EJE_BASE, splitLine: { show: false },
        axisLabel: { ...EJE_BASE.axisLabel, hideOverlap: true },
      },
      yAxis: {
        type: 'value' as const, name: 'segundos',
        nameTextStyle: { color: COLORES.textoTenue, fontSize: 10 },
        ...EJE_BASE,
      },
      series: [{
        type: 'bar' as const,
        barMaxWidth: 44,
        data: ord.map((d) => ({
          value: d.segundos,
          itemStyle: {
            color: d.segundos <= objetivoS
              ? sombra(COLORES.verde, 0.8)
              : sombra(COLORES.ambar, 0.85),
            borderRadius: [3, 3, 0, 0],
          },
        })),
        label: {
          show: true, position: 'top' as const,
          color: COLORES.textoSec, fontSize: 10,
          formatter: '{c} s',
        },
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: COLORES.rojo, type: 'dashed' as const, width: 1.4 },
          label: {
            formatter: `objetivo ${objetivoS} s`,
            color: COLORES.rojo, fontSize: 9, position: 'insideEndTop' as const,
          },
          data: [{ yAxis: objetivoS }],
        },
      }],
    };
  }, [detalle, objetivoS]);

  if (!detalle.length) {
    return (
      <p className="text-text-muted text-sm py-10 text-center">
        Sin caídas registradas en la ventana
      </p>
    );
  }

  return (
    <ReactECharts option={option} style={{ height: alto, width: '100%' }}
      opts={{ renderer: 'canvas' }} notMerge />
  );
}
