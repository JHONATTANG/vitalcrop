'use client';

/**
 * Qué decidió el borde por su cuenta, por tipo de decisión.
 *
 * Es la evidencia de la tesis en una sola gráfica: cada barra es una
 * acción que el sistema tomó sin preguntarle a la nube. Mientras la
 * nube estuvo apagada —18 de los 18 días— estas decisiones se siguieron
 * ejecutando igual, y el cultivo no se enteró.
 *
 * Las barras van horizontales porque las etiquetas son frases
 * («riego de hidroponía terminado») y en vertical habría que girarlas.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORES, TOOLTIP, EJE_BASE, sombra } from '@/components/charts/tema';

interface Props {
  decisiones: Array<{ evento: string; n: number; primero: string; ultimo: string }>;
  alto?: number;
}

const NOMBRE: Record<string, string> = {
  riego_hidroponia_fin:    'Riego de hidroponía terminado',
  riego_hidroponia_inicio: 'Riego de hidroponía iniciado',
  riego_tierra_fin:        'Llenado de tierra terminado',
  riego_tierra_inicio:     'Llenado de tierra iniciado',
  conectado:               'Nodo reasociado al punto de acceso',
  desconectado:            'Nodo perdido del punto de acceso',
  programa_repuesto:       'Programa reenviado al nodo',
  hora_repuesta:           'Reloj del nodo corregido',
  programa_discrepante:    'Discrepancia de programa corregida',
};

const COLOR = (evento: string) =>
  evento.startsWith('riego') ? COLORES.verde
    : evento === 'desconectado' ? COLORES.rojo
    : evento === 'conectado' ? COLORES.azul
    : COLORES.ambar;

export default function DecisionesBorde({ decisiones, alto = 260 }: Props) {
  const option = useMemo(() => {
    // Ascendente porque el eje Y de ECharts crece hacia arriba: así la
    // barra más larga queda arriba del todo, que es donde se busca.
    const ord = [...decisiones].sort((a, b) => a.n - b.n);

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 44, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const, shadowStyle: { color: sombra(COLORES.azul, 0.06) } },
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const d = ord[ps[0]?.dataIndex ?? 0];
          if (!d) return '';
          const f = (iso: string) => new Date(iso).toLocaleString('es', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          });
          return `<div style="font-weight:600;margin-bottom:4px">${NOMBRE[d.evento] ?? d.evento}</div>
            <div style="color:${COLORES.textoSec};font-size:11px">
              <b style="color:${COLORES.texto}">${d.n}</b> veces<br>
              primera: ${f(d.primero)}<br>última: ${f(d.ultimo)}
            </div>
            <div style="color:${COLORES.textoTenue};font-size:10px;margin-top:4px">${d.evento}</div>`;
        },
      },
      xAxis: { type: 'value' as const, ...EJE_BASE },
      yAxis: {
        type: 'category' as const,
        data: ord.map((d) => NOMBRE[d.evento] ?? d.evento.replace(/_/g, ' ')),
        ...EJE_BASE,
        splitLine: { show: false },
        axisLabel: { ...EJE_BASE.axisLabel, fontSize: 10, width: 190, overflow: 'truncate' as const },
      },
      series: [{
        type: 'bar' as const,
        barMaxWidth: 20,
        data: ord.map((d) => ({
          value: d.n,
          itemStyle: { color: sombra(COLOR(d.evento), 0.8), borderRadius: [0, 3, 3, 0] },
        })),
        label: {
          show: true, position: 'right' as const,
          color: COLORES.textoSec, fontSize: 10,
        },
      }],
    };
  }, [decisiones]);

  if (!decisiones.length) {
    return <p className="text-text-muted text-sm py-10 text-center">Sin decisiones registradas</p>;
  }

  return (
    <ReactECharts option={option} style={{ height: alto, width: '100%' }}
      opts={{ renderer: 'canvas' }} notMerge />
  );
}
