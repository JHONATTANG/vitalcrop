'use client';

/**
 * Los intervalos en que no llegó ninguna trama, situados en el tiempo.
 *
 * Una lista de huecos ordenada por duración dice cuál fue el peor. Esta
 * vista dice algo distinto y más útil: *cuándo* pasaron. Los huecos
 * agrupados en un mismo día apuntan a una causa común —una tarde de
 * reflasheos, un corte de luz— mientras que repartidos apuntan a un
 * problema de fondo del enlace.
 *
 * Se dibuja con barras horizontales posicionadas por su instante real
 * (`custom` series) y no con una categoría por hueco, porque el eje
 * tiene que ser el calendario para que la distancia entre dos huecos
 * signifique algo.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORES, TOOLTIP, EJE_BASE, sombra } from '@/components/charts/tema';

interface Props {
  huecos: Array<{ desde: string; hasta: string; segundos: number }>;
  alto?: number;
}

function duracion(s: number): string {
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export default function HuecosDeDatos({ huecos, alto = 220 }: Props) {
  const option = useMemo(() => {
    const datos = huecos.map((h) => ({
      value: [new Date(h.desde).getTime(), new Date(h.hasta).getTime(), h.segundos],
      itemStyle: {
        // La escala de color va con la gravedad. Un hueco de un minuto
        // es una trama perdida; uno de una hora es una caída.
        color: h.segundos > 1800 ? sombra(COLORES.rojo, 0.85)
          : h.segundos > 300 ? sombra(COLORES.ambar, 0.85)
          : sombra(COLORES.textoTenue, 0.8),
      },
    }));

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        formatter: (p: { value: number[] }) => {
          const [ini, fin, s] = p.value;
          const f = (t: number) => new Date(t).toLocaleString('es', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
          return `<div style="font-weight:600;margin-bottom:4px">Sin datos durante ${duracion(s)}</div>
                  <div style="color:${COLORES.textoSec};font-size:11px">${f(ini)} → ${f(fin)}</div>`;
        },
      },
      xAxis: {
        type: 'time' as const, ...EJE_BASE,
        axisLabel: {
          ...EJE_BASE.axisLabel,
          formatter: (v: number) => new Date(v).toLocaleDateString('es', {
            day: '2-digit', month: 'short',
          }),
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'category' as const, data: ['huecos'],
        ...EJE_BASE,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: [{
        type: 'custom' as const,
        // Cada hueco es un rectángulo que ocupa su intervalo real. Un
        // hueco de un minuto sale casi como una línea, y así debe ser.
        renderItem: (params: unknown, api: {
          value: (i: number) => number;
          coord: (v: number[]) => number[];
          size: (v: number[]) => number[];
          style: () => Record<string, unknown>;
        }) => {
          const ini = api.coord([api.value(0), 0]);
          const fin = api.coord([api.value(1), 0]);
          const alturaBarra = (api.size([0, 1])[1] as number) * 0.55;
          const ancho = Math.max(2, fin[0] - ini[0]);
          return {
            type: 'rect',
            shape: {
              x: ini[0], y: ini[1] - alturaBarra / 2,
              width: ancho, height: alturaBarra, r: 2,
            },
            style: api.style(),
          };
        },
        encode: { x: [0, 1], y: 0 },
        data: datos,
      }],
    };
  }, [huecos]);

  if (!huecos.length) {
    return (
      <p className="text-text-muted text-sm py-10 text-center">
        Sin huecos: la serie no se interrumpió en la ventana
      </p>
    );
  }

  return (
    <div>
      <ReactECharts option={option} style={{ height: alto, width: '100%' }}
        opts={{ renderer: 'canvas' }} notMerge />
      <div className="flex items-center justify-center gap-4 text-[11px] text-text-muted -mt-2">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: sombra(COLORES.textoTenue, .8) }} />
          menos de 5 min
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: sombra(COLORES.ambar, .85) }} />
          entre 5 y 30 min
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: sombra(COLORES.rojo, .85) }} />
          más de 30 min
        </span>
      </div>
    </div>
  );
}
