'use client';

/**
 * Nube de puntos entre dos métricas, con la hora del día como color.
 *
 * Responde lo que una serie temporal esconde. Si la EC sube a la vez
 * que la temperatura, en dos series paralelas parecen "subir juntas";
 * aquí se ve si es una relación real o dos tendencias que coinciden.
 *
 * El color por hora es la parte que hace útil el gráfico: una nube sin
 * estructura que al colorearla se separa en dos brazos —día y noche—
 * está diciendo que la variable oculta es el fotoperiodo y no la
 * métrica del eje X.
 *
 * La recta de ajuste se calcula aquí, sobre los puntos ya
 * submuestreados, y por eso su pendiente es orientativa. El coeficiente
 * que se muestra viene del servidor y sí está calculado sobre la
 * población completa.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  COLORES, ETIQUETA_METRICA, UNIDAD_METRICA, TOOLTIP, EJE_BASE, sombra,
} from './tema';
import type { PuntoCorrelacion } from '@/hooks/useTelecom';

interface Props {
  puntos: PuntoCorrelacion[];
  x: string;
  y: string;
  r?: number | null;
  alto?: number;
}

export default function Correlacion({ puntos, x, y, r, alto = 320 }: Props) {
  const option = useMemo(() => {
    const datos = puntos.map((p) => [p.x, p.y, p.hora]);

    // Mínimos cuadrados sobre la muestra, solo para orientar la vista.
    let recta: Array<[number, number]> = [];
    if (puntos.length > 2) {
      const n = puntos.length;
      const sx = puntos.reduce((a, p) => a + p.x, 0);
      const sy = puntos.reduce((a, p) => a + p.y, 0);
      const sxy = puntos.reduce((a, p) => a + p.x * p.y, 0);
      const sxx = puntos.reduce((a, p) => a + p.x * p.x, 0);
      const den = n * sxx - sx * sx;
      if (Math.abs(den) > 1e-9) {
        const m = (n * sxy - sx * sy) / den;
        const b = (sy - m * sx) / n;
        const xs = puntos.map((p) => p.x);
        const x0 = Math.min(...xs), x1 = Math.max(...xs);
        recta = [[x0, m * x0 + b], [x1, m * x1 + b]];
      }
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 16, top: 16, bottom: 44, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        trigger: 'item' as const,
        formatter: (p: { value: number[] }) =>
          `<div style="font-variant-numeric:tabular-nums">
             ${ETIQUETA_METRICA[x] ?? x}: <b>${p.value[0]}</b> ${UNIDAD_METRICA[x] ?? ''}<br>
             ${ETIQUETA_METRICA[y] ?? y}: <b>${p.value[1]}</b> ${UNIDAD_METRICA[y] ?? ''}<br>
             <span style="color:${COLORES.textoSec}">a las ${String(p.value[2]).padStart(2, '0')}:00</span>
           </div>`,
      },
      // La barra de color es la leyenda de la hora: sin ella, el degradado
      // de los puntos es decorativo y no se puede leer.
      visualMap: {
        type: 'continuous' as const,
        min: 0, max: 23,
        dimension: 2,
        calculable: true,
        orient: 'horizontal' as const,
        left: 'center', bottom: 0,
        itemWidth: 12, itemHeight: 110,
        precision: 0,
        text: ['23 h', '0 h'],
        textStyle: { color: COLORES.textoTenue, fontSize: 9 },
        inRange: {
          // Azul de madrugada, ámbar al mediodía, azul de vuelta: el
          // ciclo es circular y la paleta también, o las 23:00 y las
          // 00:00 saldrían en extremos opuestos siendo casi lo mismo.
          color: [COLORES.azul, COLORES.cian, COLORES.ambar, COLORES.rosa, COLORES.azul],
        },
      },
      xAxis: {
        type: 'value' as const, scale: true, ...EJE_BASE,
        name: `${ETIQUETA_METRICA[x] ?? x} (${UNIDAD_METRICA[x] ?? ''})`,
        nameLocation: 'middle' as const, nameGap: 26,
        nameTextStyle: { color: COLORES.textoSec, fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const, scale: true, ...EJE_BASE,
        name: `${ETIQUETA_METRICA[y] ?? y} (${UNIDAD_METRICA[y] ?? ''})`,
        nameTextStyle: { color: COLORES.textoSec, fontSize: 10 },
      },
      series: [
        {
          type: 'scatter' as const,
          data: datos,
          symbolSize: 5,
          itemStyle: { opacity: 0.55 },
          large: true,
          largeThreshold: 800,
        },
        ...(recta.length ? [{
          type: 'line' as const,
          data: recta,
          showSymbol: false,
          lineStyle: { color: COLORES.texto, width: 1.4, type: 'dashed' as const },
          tooltip: { show: false },
          silent: true,
          z: 4,
        }] : []),
      ],
    };
  }, [puntos, x, y]);

  if (!puntos.length) {
    return <p className="text-text-muted text-sm py-12 text-center">Sin puntos que cruzar</p>;
  }

  const fuerza = r === null || r === undefined ? null
    : Math.abs(r) < 0.2 ? 'sin relación apreciable'
    : Math.abs(r) < 0.5 ? 'relación débil'
    : Math.abs(r) < 0.8 ? 'relación moderada'
    : 'relación fuerte';

  return (
    <div>
      <ReactECharts
        option={option}
        style={{ height: alto, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge
      />
      {fuerza && (
        <p className="text-[11px] text-text-muted text-center -mt-1 tabular-nums">
          coeficiente de Pearson <span className="text-text-secondary font-medium">r = {r}</span>
          {' · '}{fuerza}
          {' · '}
          <span style={{ color: sombra(COLORES.textoTenue, 1) }}>
            {puntos.length.toLocaleString()} puntos mostrados
          </span>
        </p>
      )}
    </div>
  );
}
