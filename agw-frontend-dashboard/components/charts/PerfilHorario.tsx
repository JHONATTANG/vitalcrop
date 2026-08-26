'use client';

/**
 * Las 24 horas del día promediadas sobre toda la ventana, en polar.
 *
 * El día es circular y una gráfica de barras lo corta por un punto
 * arbitrario: las 23:00 y las 00:00 acaban en extremos opuestos siendo
 * una hora consecutiva. En polar, el patrón se cierra sobre sí mismo y
 * se ve como lo que es, un ciclo.
 *
 * Cruza cuatro cosas sobre el mismo reloj: la temperatura, el RSSI, los
 * riegos ejecutados y las tramas por debajo del umbral. Ahí es donde se
 * lee el efecto del fotoperiodo sobre el enlace — el balastro y el
 * ventilador arrancan a las 6 y son ruido electromagnético.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORES, TOOLTIP, sombra } from './tema';
import type { HoraPerfil } from '@/hooks/useTelecom';

interface Props {
  horas: HoraPerfil[];
  riegoPorHora?: Array<{ hora: number; ciclos: number }>;
  alto?: number;
  fotoperiodo?: { on: number; off: number };
}

export default function PerfilHorario({
  horas, riegoPorHora = [], alto = 380, fotoperiodo = { on: 6, off: 18 },
}: Props) {
  const option = useMemo(() => {
    // La ventana puede no tener muestras de alguna hora; la rejilla se
    // construye completa para que el reloj no salga con un sector menos.
    const porHora = new Map(horas.map((h) => [h.hora, h]));
    const riego = new Map(riegoPorHora.map((r) => [r.hora, r.ciclos]));
    const todas = Array.from({ length: 24 }, (_, i) => i);

    const temp = todas.map((h) => porHora.get(h)?.temperatura ?? null);
    const rssi = todas.map((h) => porHora.get(h)?.rssi ?? null);
    const ciclos = todas.map((h) => riego.get(h) ?? 0);

    // El RSSI es negativo y la temperatura positiva: en el mismo eje
    // radial, uno queda fuera del gráfico. Se traslada a "margen sobre
    // el umbral", que es positivo y además es la lectura útil: cuántos
    // dB sobran antes de incumplir el objetivo del §9.
    const margen = rssi.map((v) => (v === null ? null : Number((v + 70).toFixed(1))));

    return {
      backgroundColor: 'transparent',
      polar: { radius: ['22%', '74%'], center: ['50%', '52%'] },
      angleAxis: {
        type: 'category' as const,
        data: todas.map((h) => `${String(h).padStart(2, '0')}h`),
        startAngle: 90,
        // El reloj avanza como un reloj. Por defecto ECharts va al revés
        // y las horas se leen en sentido antihorario.
        clockwise: true,
        axisLine: { lineStyle: { color: COLORES.borde } },
        axisTick: { show: false },
        axisLabel: { color: COLORES.textoTenue, fontSize: 9 },
        splitLine: { show: true, lineStyle: { color: COLORES.borde, opacity: 0.3 } },
      },
      radiusAxis: {
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORES.textoTenue, fontSize: 9 },
        splitLine: { lineStyle: { color: COLORES.borde, opacity: 0.35 } },
      },
      legend: {
        bottom: 0,
        textStyle: { color: COLORES.textoSec, fontSize: 10 },
        itemWidth: 12, itemHeight: 8,
      },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis' as const,
        formatter: (ps: Array<{ dataIndex: number }>) => {
          const i = ps[0]?.dataIndex ?? 0;
          const h = porHora.get(i);
          const esNoche = i < fotoperiodo.on || i >= fotoperiodo.off;
          const fila = (k: string, v: string, c: string = COLORES.texto) =>
            `<div style="display:flex;gap:14px;justify-content:space-between">
               <span style="color:${COLORES.textoSec}">${k}</span>
               <b style="color:${c};font-variant-numeric:tabular-nums">${v}</b></div>`;
          return `<div style="font-weight:600;margin-bottom:5px">
                    ${String(i).padStart(2, '0')}:00
                    <span style="color:${esNoche ? COLORES.azul : COLORES.ambar};font-weight:400;font-size:10px">
                      · ${esNoche ? 'oscuridad' : 'luz encendida'}</span>
                  </div>`
            + fila('Temperatura', h?.temperatura !== null && h?.temperatura !== undefined ? `${h.temperatura} °C` : '—', COLORES.ambar)
            + fila('Humedad', h?.humedad !== null && h?.humedad !== undefined ? `${h.humedad} %` : '—', COLORES.cian)
            + fila('RSSI', h?.rssi !== null && h?.rssi !== undefined ? `${h.rssi} dBm` : '—', COLORES.azul)
            + fila('Dispersión σ', h?.rssi_sigma !== null && h?.rssi_sigma !== undefined ? `${h.rssi_sigma} dB` : '—')
            + fila('Tramas bajo −70', String(h?.rssi_bajo ?? 0), (h?.rssi_bajo ?? 0) > 0 ? COLORES.rojo : COLORES.textoTenue)
            + fila('Ciclos de riego', String(riego.get(i) ?? 0), COLORES.verde)
            + fila('Muestras', (h?.n ?? 0).toLocaleString(), COLORES.textoTenue);
        },
      },
      series: [
        {
          name: 'Ciclos de riego',
          type: 'bar' as const,
          coordinateSystem: 'polar' as const,
          data: ciclos,
          itemStyle: { color: sombra(COLORES.verde, 0.45) },
          barMaxWidth: 22,
          z: 1,
        },
        {
          name: 'Temperatura (°C)',
          type: 'line' as const,
          coordinateSystem: 'polar' as const,
          data: temp,
          smooth: true,
          symbol: 'circle', symbolSize: 4,
          lineStyle: { color: COLORES.ambar, width: 2 },
          itemStyle: { color: COLORES.ambar },
          areaStyle: { color: sombra(COLORES.ambar, 0.14) },
          z: 3,
        },
        {
          name: 'Margen de RSSI sobre −70 (dB)',
          type: 'line' as const,
          coordinateSystem: 'polar' as const,
          data: margen,
          smooth: true,
          symbol: 'circle', symbolSize: 4,
          lineStyle: { color: COLORES.azul, width: 2 },
          itemStyle: { color: COLORES.azul },
          areaStyle: { color: sombra(COLORES.azul, 0.14) },
          z: 2,
        },
      ],
    };
  }, [horas, riegoPorHora, fotoperiodo]);

  if (!horas.length) {
    return <p className="text-text-muted text-sm py-12 text-center">Sin muestras horarias</p>;
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
