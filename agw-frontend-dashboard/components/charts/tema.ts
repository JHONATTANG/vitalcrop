/**
 * Piezas compartidas de las gráficas.
 *
 * Cada componente traía su propio bloque de ejes, rejilla y tooltip
 * copiado del anterior, y ya habían divergido: mismas gráficas con
 * rejillas de distinto gris y tooltips con formatos distintos. Aquí
 * viven una vez.
 *
 * No es un "tema" de ECharts registrado a propósito: registrar un tema
 * global obliga a que todas las gráficas lo hereden, incluidas las que
 * necesitan salirse (el mapa de calor, la topología). Exportar piezas
 * componibles deja elegir.
 */

export const COLORES = {
  fondo:      '#1A2235',
  fondoAlt:   '#111827',
  borde:      '#1F2D45',
  texto:      '#F1F5F9',
  textoSec:   '#94A3B8',
  textoTenue: '#64748B',
  verde:      '#10B981',
  azul:       '#3B82F6',
  ambar:      '#F59E0B',
  rojo:       '#EF4444',
  violeta:    '#A78BFA',
  cian:       '#22D3EE',
  rosa:       '#F472B6',
} as const;

/** Paleta de series, en el orden en que se reparten. */
export const PALETA = [
  COLORES.verde, COLORES.azul, COLORES.ambar, COLORES.violeta,
  COLORES.cian, COLORES.rosa, COLORES.rojo,
];

/** Color por métrica, para que la EC sea del mismo verde en toda la app. */
export const COLOR_METRICA: Record<string, string> = {
  temperatura:      COLORES.ambar,
  humedad_ambiente: COLORES.cian,
  humedad_suelo:    COLORES.violeta,
  ec:               COLORES.verde,
  tds:              COLORES.rosa,
  rssi:             COLORES.azul,
  nivel_raw:        COLORES.textoSec,
};

export const ETIQUETA_METRICA: Record<string, string> = {
  temperatura:      'Temperatura',
  humedad_ambiente: 'Humedad del aire',
  humedad_suelo:    'Humedad del sustrato',
  ec:               'Conductividad',
  tds:              'Sólidos disueltos',
  rssi:             'RSSI',
  nivel_raw:        'Sensor de nivel (crudo)',
};

export const UNIDAD_METRICA: Record<string, string> = {
  temperatura:      '°C',
  humedad_ambiente: '%',
  humedad_suelo:    '%',
  ec:               'µS/cm',
  tds:              'ppm',
  rssi:             'dBm',
  nivel_raw:        'ADC',
};

/** Tooltip oscuro, uniforme en todas las gráficas. */
export const TOOLTIP = {
  backgroundColor: 'rgba(10,15,30,.95)',
  borderColor: COLORES.borde,
  borderWidth: 1,
  textStyle: { color: COLORES.texto, fontSize: 11 },
  extraCssText: 'border-radius:8px;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);',
} as const;

export const EJE_BASE = {
  axisLine:  { lineStyle: { color: COLORES.borde } },
  axisTick:  { show: false },
  axisLabel: { color: COLORES.textoTenue, fontSize: 10 },
  splitLine: { lineStyle: { color: COLORES.borde, opacity: 0.35 } },
} as const;

export const REJILLA = {
  left: 52, right: 52, top: 32, bottom: 40, containLabel: true,
} as const;

export const LEYENDA = {
  textStyle: { color: COLORES.textoSec, fontSize: 11 },
  inactiveColor: COLORES.textoTenue,
  itemWidth: 14,
  itemHeight: 8,
  top: 0,
} as const;

/**
 * Degradado vertical para el área bajo una línea.
 *
 * Se define con `type: 'linear'` en coordenadas relativas al gráfico y
 * no con un rgba plano: un relleno opaco tapa la serie que queda
 * detrás en cuanto hay dos áreas superpuestas, mientras que el
 * degradado que muere en transparente deja verlas todas.
 */
export function areaDegradado(color: string, opacidad = 0.38) {
  return {
    color: {
      type: 'linear' as const,
      x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: sombra(color, opacidad) },
        { offset: 1, color: sombra(color, 0) },
      ],
    },
  };
}

/** Convierte '#RRGGBB' en rgba con la opacidad pedida. */
export function sombra(hex: string, alfa: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alfa})`;
}

/** Control de zoom por arrastre, con la barra inferior ya estilada. */
export function zoom(inicio = 0) {
  return [
    { type: 'inside' as const, start: inicio, end: 100 },
    {
      type: 'slider' as const,
      start: inicio, end: 100, height: 18, bottom: 4,
      backgroundColor: 'transparent',
      borderColor: COLORES.borde,
      fillerColor: sombra(COLORES.azul, 0.12),
      handleStyle: { color: COLORES.azul, borderColor: COLORES.azul },
      moveHandleStyle: { color: COLORES.borde },
      dataBackground: {
        lineStyle: { color: COLORES.textoTenue, opacity: 0.5 },
        areaStyle: { color: sombra(COLORES.textoTenue, 0.18) },
      },
      selectedDataBackground: {
        lineStyle: { color: COLORES.azul },
        areaStyle: { color: sombra(COLORES.azul, 0.18) },
      },
      textStyle: { color: COLORES.textoTenue, fontSize: 9 },
    },
  ];
}

/** Fecha corta para etiquetas de eje: «24/08 15:30». */
export function etiquetaFecha(iso: string, conHora = true): string {
  const d = new Date(iso);
  const f = d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
  if (!conHora) return f;
  return `${f} ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
}
