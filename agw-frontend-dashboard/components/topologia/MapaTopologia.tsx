'use client';

/**
 * Mapa de la arquitectura como lienzo movible.
 *
 * El diagrama del informe es un dibujo: siempre enseña lo mismo aunque
 * el nodo lleve dos horas caído. Este parte de la misma disposición en
 * estrella, pero los nodos son los aparatos que hay dados de alta ahora
 * y su color sale del estado real —el que la API deduce del silencio—,
 * así que un enlace roto se ve en el mapa sin abrir otra pantalla.
 *
 * DECISIONES
 *
 * · `layout: 'none'` con coordenadas propias, no el layout de fuerzas.
 *   Una simulación física coloca los nodos donde le conviene y la
 *   estrella se deshace; además la disposición cambia en cada carga y
 *   no se puede señalar "el de arriba a la derecha". Aquí cada aparato
 *   tiene su sitio, y quien quiera moverlo lo arrastra.
 *
 * · `draggable` y `roam` activos: era el encargo explícito —que se
 *   comporte como un lienzo— y además sirve para separar los sensores
 *   cuando se solapan en pantallas estrechas.
 *
 * · El grosor de cada arista no es decorativo: codifica la calidad del
 *   enlace. El tramo ESP32→gateway se dibuja según el RSSI, así que un
 *   enlace degradado adelgaza antes de llegar a caerse.
 */
import React, { useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { RotateCcw } from 'lucide-react';
import { COLORES, TOOLTIP, sombra } from '@/components/charts/tema';
import type { Dispositivo } from '@/hooks/useDevices';

interface Props {
  dispositivos: Dispositivo[];
  /** Silencio del gateway en segundos, para el tramo hacia la nube. */
  silencioNube?: number | null;
  alto?: number;
}

type Categoria = 'nube' | 'gateway' | 'nodo' | 'sensor' | 'actuador';

interface NodoMapa {
  id: string;
  nombre: string;
  categoria: Categoria;
  x: number;
  y: number;
  estado: 'ok' | 'aviso' | 'caido' | 'inerte';
  detalle: string[];
  tam: number;
}

const COLOR_CATEGORIA: Record<Categoria, string> = {
  nube:     COLORES.violeta,
  gateway:  COLORES.azul,
  nodo:     COLORES.verde,
  sensor:   COLORES.cian,
  actuador: COLORES.ambar,
};

const COLOR_ESTADO = {
  ok:     COLORES.verde,
  aviso:  COLORES.ambar,
  caido:  COLORES.rojo,
  inerte: COLORES.textoTenue,
};

export default function MapaTopologia({
  dispositivos, silencioNube = null, alto = 460,
}: Props) {
  const ref = useRef<ReactECharts>(null);

  const { nodos, aristas } = useMemo(() => {
    const gw = dispositivos.find((d) => d.device_type === 'GATEWAY');
    const nodo = dispositivos.find((d) => d.device_type !== 'GATEWAY');
    const lectura = nodo?.ultima_lectura;
    const rssi = lectura?.rssi ?? null;

    const estadoDe = (d?: Dispositivo): NodoMapa['estado'] => {
      if (!d) return 'inerte';
      if (d.status === 'ONLINE') return 'ok';
      if (d.status === 'ERROR') return 'aviso';
      if (d.status === 'OFFLINE') return 'caido';
      return 'inerte';
    };

    const nodoVivo = estadoDe(nodo) === 'ok';
    const uptimeH = lectura?.uptime_ms ? (lectura.uptime_ms / 3_600_000).toFixed(1) : null;

    // Coordenadas del lienzo. El gateway ocupa el centro porque es el
    // punto por el que pasa todo: sin él no hay ni ruta a la nube ni
    // red para el nodo.
    const N: NodoMapa[] = [
      {
        id: 'nube', nombre: 'Nube · Vercel + Neon', categoria: 'nube',
        x: 0, y: -230, tam: 62,
        estado: silencioNube === null ? 'inerte'
          : silencioNube < 900 ? 'ok' : silencioNube < 3600 ? 'aviso' : 'caido',
        detalle: [
          'API FastAPI sobre funciones sin servidor',
          'PostgreSQL gestionado (Neon)',
          silencioNube !== null
            ? `última trama hace ${Math.round(silencioNube / 60)} min`
            : 'sin ingesta registrada',
        ],
      },
      {
        id: 'wan', nombre: 'Enlace WAN', categoria: 'nube',
        x: 0, y: -120, tam: 34,
        estado: silencioNube === null ? 'inerte' : silencioNube < 900 ? 'ok' : 'caido',
        detalle: [
          'Salida a internet del gateway',
          'Si cae, el borde sigue decidiendo solo',
        ],
      },
      {
        id: 'gw',
        nombre: gw?.alias ?? 'Gateway fog',
        categoria: 'gateway',
        x: 0, y: 0, tam: 78,
        estado: estadoDe(gw),
        detalle: [
          gw?.device_uid ?? 'sin identificador',
          'Broker MQTT · motor de reglas · buffer SQLite',
          'Punto de acceso privado del cultivo',
        ],
      },
      {
        id: 'ap', nombre: 'Punto de acceso 2,4 GHz', categoria: 'gateway',
        x: -215, y: 95, tam: 40,
        estado: nodoVivo ? 'ok' : 'aviso',
        detalle: [
          'hostapd sobre la interfaz interna',
          'Red aislada: el nodo no tiene salida a internet',
          rssi !== null ? `RSSI del nodo asociado: ${rssi} dBm` : 'sin estación asociada',
        ],
      },
      {
        id: 'nodo',
        nombre: nodo?.alias ?? 'Nodo ESP32',
        categoria: 'nodo',
        x: 0, y: 175, tam: 70,
        estado: estadoDe(nodo),
        detalle: [
          nodo?.device_uid ?? 'sin identificador',
          nodo?.firmware_version ? `firmware ${nodo.firmware_version}` : 'firmware desconocido',
          uptimeH ? `${uptimeH} h en marcha` : 'sin uptime reportado',
          rssi !== null ? `enlace a ${rssi} dBm` : 'sin señal medida',
        ],
      },
      // ── Sensores ────────────────────────────────────────────
      {
        id: 'hdc', nombre: 'HDC1080', categoria: 'sensor',
        x: -240, y: 258, tam: 40,
        estado: lectura?.temperatura !== null && lectura?.temperatura !== undefined ? 'ok' : 'inerte',
        detalle: [
          'Temperatura y humedad del aire, bus I²C',
          lectura?.temperatura !== null && lectura?.temperatura !== undefined
            ? `${lectura.temperatura} °C · ${lectura.humedad ?? '—'} % HR`
            : 'sin lectura',
        ],
      },
      {
        id: 'tds', nombre: 'Sonda TDS', categoria: 'sensor',
        x: -120, y: 330, tam: 40,
        estado: lectura?.ec ? 'ok' : 'inerte',
        detalle: [
          'Conductividad de la solución, ADC1 GPIO 33',
          lectura?.ec ? `${lectura.ec} µS/cm` : 'sin lectura',
        ],
      },
      {
        id: 'nivel', nombre: 'Sensor de nivel', categoria: 'sensor',
        x: 120, y: 330, tam: 40,
        estado: lectura?.agua === null || lectura?.agua === undefined ? 'inerte' : 'ok',
        detalle: [
          'Detecta agua en el sustrato, ADC1 GPIO 32',
          'Corta el llenado de tierra cuando varía',
          lectura?.agua ? 'agua detectada' : 'sustrato sin agua libre',
        ],
      },
      // ── Actuadores ──────────────────────────────────────────
      {
        id: 'bomba', nombre: 'Bomba', categoria: 'actuador',
        x: 240, y: 258, tam: 40, estado: nodoVivo ? 'ok' : 'inerte',
        detalle: ['Relé de la bomba principal', 'Nunca más de 60 min seguidos'],
      },
      {
        id: 'v_hidro', nombre: 'Válvula hidroponía', categoria: 'actuador',
        x: 300, y: 130, tam: 38, estado: nodoVivo ? 'ok' : 'inerte',
        detalle: ['Circuito de raíz flotante', 'Día 4 ciclos/hora · noche 1'],
      },
      {
        id: 'v_tierra', nombre: 'Válvula tierra', categoria: 'actuador',
        x: 300, y: 20, tam: 38, estado: nodoVivo ? 'ok' : 'inerte',
        detalle: ['Llenado del sustrato', 'Cada 10 días, con corte por sensor'],
      },
      {
        id: 'luz', nombre: 'Luz y ventilador', categoria: 'actuador',
        x: 215, y: -85, tam: 40, estado: nodoVivo ? 'ok' : 'inerte',
        detalle: ['Fotoperiodo 06:00 → 18:00', 'Corte por sobretemperatura a 38 °C'],
      },
    ];

    // Grosor del tramo inalámbrico según el RSSI. −55 dBm es excelente
    // y −85 es el borde de lo utilizable; se mapea a ese intervalo.
    const grosorEnlace = rssi === null ? 1
      : Math.max(1, Math.min(6, 6 - ((-rssi - 55) / 30) * 5));

    const A = [
      { source: 'gw', target: 'wan', valor: 'HTTPS', ancho: silencioNube !== null && silencioNube < 900 ? 3 : 1, guion: silencioNube !== null && silencioNube < 900 ? undefined : 'dashed' },
      { source: 'wan', target: 'nube', valor: 'REST · JSON', ancho: silencioNube !== null && silencioNube < 900 ? 3 : 1, guion: silencioNube !== null && silencioNube < 900 ? undefined : 'dashed' },
      { source: 'gw', target: 'ap', valor: 'hostapd', ancho: 2.5 },
      { source: 'ap', target: 'nodo', valor: rssi !== null ? `WiFi ${rssi} dBm` : 'WiFi', ancho: grosorEnlace, curva: 0.12 },
      { source: 'nodo', target: 'gw', valor: 'MQTT', ancho: nodoVivo ? 3 : 1, curva: -0.22, guion: nodoVivo ? undefined : 'dashed' },
      { source: 'nodo', target: 'hdc', valor: 'I²C', ancho: 1.6 },
      { source: 'nodo', target: 'tds', valor: 'ADC', ancho: 1.6 },
      { source: 'nodo', target: 'nivel', valor: 'ADC', ancho: 1.6 },
      { source: 'nodo', target: 'bomba', valor: 'relé', ancho: 1.6 },
      { source: 'nodo', target: 'v_hidro', valor: 'relé', ancho: 1.6 },
      { source: 'nodo', target: 'v_tierra', valor: 'relé', ancho: 1.6 },
      { source: 'nodo', target: 'luz', valor: 'relé', ancho: 1.6 },
    ];

    return { nodos: N, aristas: A };
  }, [dispositivos, silencioNube]);

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      ...TOOLTIP,
      formatter: (p: { dataType: string; data: Record<string, unknown> }) => {
        if (p.dataType === 'edge') {
          const d = p.data as { valor?: string; source?: string; target?: string };
          return `<b>${d.valor ?? 'enlace'}</b>`;
        }
        const d = p.data as unknown as NodoMapa;
        const punto = { ok: COLORES.verde, aviso: COLORES.ambar, caido: COLORES.rojo, inerte: COLORES.textoTenue }[d.estado];
        const rotulo = { ok: 'en línea', aviso: 'con retraso', caido: 'sin respuesta', inerte: 'sin telemetría' }[d.estado];
        return `<div style="min-width:190px">
            <div style="font-weight:600;margin-bottom:2px">${d.nombre}</div>
            <div style="color:${punto};font-size:10px;margin-bottom:6px">● ${rotulo}</div>
            ${d.detalle.map((l) => `<div style="color:${COLORES.textoSec};font-size:11px">${l}</div>`).join('')}
          </div>`;
      },
    },
    legend: [{
      data: ['Nube', 'Gateway', 'Nodo', 'Sensores', 'Actuadores'],
      bottom: 2,
      textStyle: { color: COLORES.textoSec, fontSize: 10 },
      itemWidth: 10, itemHeight: 10,
    }],
    series: [{
      type: 'graph' as const,
      layout: 'none' as const,
      roam: true,
      draggable: true,
      categories: [
        { name: 'Nube',       itemStyle: { color: COLOR_CATEGORIA.nube } },
        { name: 'Gateway',    itemStyle: { color: COLOR_CATEGORIA.gateway } },
        { name: 'Nodo',       itemStyle: { color: COLOR_CATEGORIA.nodo } },
        { name: 'Sensores',   itemStyle: { color: COLOR_CATEGORIA.sensor } },
        { name: 'Actuadores', itemStyle: { color: COLOR_CATEGORIA.actuador } },
      ],
      label: {
        show: true,
        position: 'bottom' as const,
        color: COLORES.texto,
        fontSize: 10,
        distance: 6,
        formatter: (p: { data: unknown }) => (p.data as NodoMapa).nombre,
      },
      edgeLabel: {
        show: true,
        color: COLORES.textoTenue,
        fontSize: 9,
        formatter: (p: { data: unknown }) => (p.data as { valor?: string }).valor ?? '',
      },
      emphasis: {
        // 'adjacency' apaga todo menos el nodo señalado y sus enlaces.
        // En una estrella con doce aristas es la diferencia entre ver
        // de dónde cuelga algo y adivinarlo. `focusNodeAdjacency`, que
        // hacía esto en ECharts 4, está retirado desde la 5.
        focus: 'adjacency' as const,
        scale: 1.08,
        label: { color: COLORES.texto, fontWeight: 'bold' as const },
        lineStyle: { width: 4, opacity: 1 },
      },
      data: nodos.map((n) => ({
        ...n,
        name: n.id,
        value: n.nombre,
        symbolSize: n.tam,
        category: { nube: 0, gateway: 1, nodo: 2, sensor: 3, actuador: 4 }[n.categoria],
        itemStyle: {
          color: sombra(COLOR_CATEGORIA[n.categoria], n.estado === 'inerte' ? 0.25 : 0.85),
          // El anillo lleva el estado y el relleno lleva el rol. Dos
          // canales distintos para dos cosas distintas: si el color
          // dijera las dos, no se podría ver un sensor caído.
          borderColor: COLOR_ESTADO[n.estado],
          borderWidth: n.estado === 'ok' ? 2 : 3,
          shadowBlur: n.estado === 'caido' ? 18 : 10,
          shadowColor: sombra(COLOR_ESTADO[n.estado], n.estado === 'caido' ? 0.7 : 0.35),
        },
      })),
      links: aristas.map((a) => ({
        source: a.source,
        target: a.target,
        valor: a.valor,
        lineStyle: {
          width: a.ancho,
          color: COLORES.borde,
          opacity: 0.85,
          curveness: a.curva ?? 0,
          type: a.guion ?? 'solid',
        },
      })),
      lineStyle: { color: COLORES.borde, curveness: 0 },
    }],
  }), [nodos, aristas]);

  const recolocar = () => {
    // `notMerge` en el setOption reconstruye la serie con las posiciones
    // originales, que es justo lo que hace falta después de arrastrar.
    ref.current?.getEchartsInstance().setOption(option, true);
  };

  return (
    <div className="relative">
      <button
        onClick={recolocar}
        className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-md border
                   border-brand-border bg-bg-secondary/90 px-2 py-1 text-[11px]
                   text-text-secondary hover:text-text-primary transition-colors"
        title="Devolver cada aparato a su posición original"
      >
        <RotateCcw size={11} /> Recolocar
      </button>
      <ReactECharts
        ref={ref}
        option={option}
        style={{ height: alto, width: '100%', cursor: 'grab' }}
        opts={{ renderer: 'canvas' }}
      />
      <p className="text-[11px] text-text-muted text-center -mt-2">
        Arrastra cualquier aparato para recomponer el mapa · rueda para acercar ·
        el grosor de cada enlace refleja su calidad real
      </p>
    </div>
  );
}
