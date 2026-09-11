'use client';

/**
 * Mapa de la instalación como lienzo movible.
 *
 * Los tres aparatos reales —el gateway y los dos ESP32— con lo que
 * cada uno tiene conectado, colocados en estrella alrededor del
 * gateway. El color de cada anillo sale del estado que la API deduce
 * del silencio, así que un enlace roto se ve sin abrir otra pantalla.
 *
 * La versión anterior pintaba UN nodo (`dispositivos.find`) con una
 * lista fija de periféricos. Con dos nodos eso era mentir dos veces:
 * el segundo no aparecía, y al primero se le dibujaban sensores que
 * en realidad son del otro. Ahora cada nodo trae sus `capacidades`
 * de la API y el mapa dibuja exactamente eso.
 *
 * DISPOSICIÓN
 *
 * · `layout: 'none'` con coordenadas propias. Un layout de fuerzas
 *   coloca los nodos donde le conviene y la estrella se deshace.
 * · Cada nodo ocupa un sector: con N nodos, se reparten en abanico
 *   por debajo del gateway y sus periféricos cuelgan hacia fuera.
 *   Así dos nodos no se solapan y un tercero cabría sin tocar nada.
 * · `draggable` y `roam`: se arrastra y se acerca. «Recolocar»
 *   devuelve la disposición original.
 * · El grosor del tramo inalámbrico codifica el RSSI del nodo.
 */
import React, { useMemo, useRef } from 'react';
import type ReactECharts from 'echarts-for-react';
import Grafica from '@/components/charts/Grafica';
import { RotateCcw } from 'lucide-react';
import { COLORES, TOOLTIP, sombra } from '@/components/charts/tema';
import type { Dispositivo } from '@/hooks/useDevices';
import type { Sensor, Actuador } from '@/types/device';

interface Props {
  dispositivos: Dispositivo[];
  silencioNube?: number | null;
  alto?: number;
  /** Solo este nodo y sus periféricos, con el gateway. Para la ficha. */
  soloNodo?: string;
}

type Categoria = 'nube' | 'gateway' | 'nodo' | 'sensor' | 'actuador';
type Estado = 'ok' | 'aviso' | 'caido' | 'inerte';

interface NodoMapa {
  id: string;
  nombre: string;
  categoria: Categoria;
  x: number;
  y: number;
  estado: Estado;
  detalle: string[];
  tam: number;
}

interface Arista {
  source: string;
  target: string;
  valor: string;
  ancho: number;
  curva?: number;
  guion?: 'dashed';
}

const COLOR_CATEGORIA: Record<Categoria, string> = {
  nube:     COLORES.violeta,
  gateway:  COLORES.azul,
  nodo:     COLORES.verde,
  sensor:   COLORES.cian,
  actuador: COLORES.ambar,
};

const COLOR_ESTADO: Record<Estado, string> = {
  ok:     COLORES.verde,
  aviso:  COLORES.ambar,
  caido:  COLORES.rojo,
  inerte: COLORES.textoTenue,
};

/** Lo que se sabe de cada periférico. El estado se decide con la lectura. */
const SENSORES: Record<Sensor, { nombre: string; bus: string; que: string }> = {
  hdc1080: { nombre: 'HDC1080',        bus: 'I²C', que: 'Temperatura y humedad del aire' },
  tds:     { nombre: 'Sonda TDS',      bus: 'ADC', que: 'Conductividad de la solución' },
  nivel:   { nombre: 'Sensor de nivel', bus: 'ADC', que: 'Agua en el sustrato; corta el llenado' },
};

const ACTUADORES: Record<Actuador, { nombre: string; que: string }> = {
  bomba:          { nombre: 'Bomba',              que: 'Bomba principal · máx. 60 min seguidos' },
  valvula_hidro:  { nombre: 'Válvula hidroponía', que: 'Raíz flotante · 3 min cada 15 de día' },
  valvula_tierra: { nombre: 'Válvula tierra',     que: 'Llenado del sustrato cada 8 días' },
  luz:            { nombre: 'Luz y ventilador',   que: 'Fotoperiodo 06:00 → 18:00' },
};

const estadoDe = (d?: Dispositivo): Estado => {
  if (!d) return 'inerte';
  if (d.status === 'ONLINE') return 'ok';
  if (d.status === 'ERROR') return 'aviso';
  if (d.status === 'OFFLINE') return 'caido';
  return 'inerte';
};

export default function MapaTopologia({
  dispositivos, silencioNube = null, alto = 520, soloNodo,
}: Props) {
  const ref = useRef<ReactECharts>(null);

  const { nodos, aristas } = useMemo(() => {
    const gw = dispositivos.find((d) => d.device_type === 'GATEWAY');
    let esp = dispositivos.filter((d) => d.device_type !== 'GATEWAY');
    if (soloNodo) esp = esp.filter((d) => d.device_uid === soloNodo || d.id === soloNodo);

    const N: NodoMapa[] = [];
    const A: Arista[] = [];
    const nubeOk = silencioNube !== null && silencioNube < 900;

    // ── Nube y gateway, en el eje ────────────────────────────
    N.push({
      id: 'nube', nombre: 'Nube', categoria: 'nube', x: 0, y: -250, tam: 56,
      estado: silencioNube === null ? 'inerte' : nubeOk ? 'ok' : silencioNube < 3600 ? 'aviso' : 'caido',
      detalle: [
        'API FastAPI + PostgreSQL (Neon)',
        silencioNube !== null ? `última trama hace ${Math.round(silencioNube / 60)} min` : 'sin ingesta',
      ],
    });
    N.push({
      id: 'gw', nombre: gw?.alias?.split(' — ')[0] ?? 'Gateway', categoria: 'gateway',
      x: 0, y: -60, tam: 84, estado: estadoDe(gw),
      detalle: [
        gw?.device_uid ?? 'sin identificador',
        'Broker MQTT · reglas · buffer SQLite',
        `Punto de acceso 2,4 GHz · ${esp.length} nodo${esp.length === 1 ? '' : 's'}`,
      ],
    });
    A.push({ source: 'gw', target: 'nube', valor: 'HTTPS', ancho: nubeOk ? 3 : 1, guion: nubeOk ? undefined : 'dashed' });

    // ── Cada nodo en su sector ───────────────────────────────
    // Con n nodos, se reparten en un abanico de 150° por debajo del
    // gateway. Los periféricos de cada uno cuelgan más lejos, en un
    // arco centrado en el ángulo del nodo, así no invaden al vecino.
    const n = esp.length;
    // Ángulos medidos desde el gateway, 90° = justo debajo. Con dos
    // nodos quedan a 45° y 135°: bien separados y con sitio debajo
    // de cada uno para su arco de periféricos.
    const abanico = n === 1 ? 0 : Math.min(110, 90 * (n - 1));
    const R_NODO = 230;

    esp.forEach((d, i) => {
      const angulo = n === 1 ? 90 : 90 - abanico / 2 + (abanico * i) / (n - 1);
      const rad = (angulo * Math.PI) / 180;
      const x = Math.cos(rad) * R_NODO * 1.35;
      const y = -60 + Math.sin(rad) * R_NODO * (n === 1 ? 0.8 : 1);
      const id = `n${i}`;
      const l = d.ultima_lectura;
      const rssi = l?.rssi ?? null;
      const vivo = estadoDe(d) === 'ok';
      const cap = d.capacidades ?? { sensores: [], actuadores: [], modulos: [] };

      N.push({
        id, categoria: 'nodo', x, y, tam: 68, estado: estadoDe(d),
        nombre: d.especie ? d.especie[0].toUpperCase() + d.especie.slice(1) : d.device_uid,
        detalle: [
          d.device_uid,
          d.firmware_version ? `firmware ${d.firmware_version}` : 'firmware desconocido',
          rssi !== null ? `enlace a ${rssi} dBm` : 'sin señal medida',
          l?.uptime_ms ? `${(l.uptime_ms / 3_600_000).toFixed(1)} h en marcha` : 'sin uptime',
          ...(d.simulado ? ['sensores simulados por el firmware'] : []),
        ],
      });
      // Grosor por RSSI: −55 excelente, −85 el borde de lo utilizable.
      const grosor = rssi === null ? 1 : Math.max(1, Math.min(6, 6 - ((-rssi - 55) / 30) * 5));
      A.push({
        source: 'gw', target: id, curva: 0,
        valor: rssi !== null ? `MQTT · ${rssi} dBm` : 'MQTT',
        ancho: vivo ? grosor : 1, guion: vivo ? undefined : 'dashed',
      });

      // Periféricos en arco alrededor del nodo, apuntando hacia fuera
      const perifs: Array<{ id: string; nombre: string; categoria: Categoria; estado: Estado; detalle: string[]; bus: string }> = [
        ...cap.sensores.map((s) => {
          const m = SENSORES[s];
          const lee = s === 'hdc1080' ? l?.temperatura != null
            : s === 'tds' ? !!l?.ec
            : l?.agua != null;
          const lectura = s === 'hdc1080' && l?.temperatura != null ? `${l.temperatura} °C · ${l.humedad ?? '—'} % HR`
            : s === 'tds' && l?.ec ? `${l.ec} µS/cm`
            : s === 'nivel' && l?.agua != null ? (l.agua ? 'agua detectada' : 'sin agua libre')
            : 'sin lectura';
          return { id: `${id}_${s}`, nombre: m.nombre, categoria: 'sensor' as const,
                   estado: lee ? 'ok' as const : 'inerte' as const, detalle: [m.que, lectura], bus: m.bus };
        }),
        ...cap.actuadores.map((a) => {
          const m = ACTUADORES[a];
          return { id: `${id}_${a}`, nombre: m.nombre, categoria: 'actuador' as const,
                   estado: vivo ? 'ok' as const : 'inerte' as const, detalle: [m.que], bus: 'relé' };
        }),
      ];
      // Arco de periféricos centrado hacia abajo (90°) y no hacia el
      // ángulo del nodo: así ninguno sube a la altura del gateway ni
      // invade el sector del vecino. Con muchos periféricos el arco se
      // abre y se aleja, para que las etiquetas no se pisen.
      const k = perifs.length;
      // Con un solo nodo no hay vecino que invadir: el arco se abre
      // hasta la horizontal y se aleja, que si no los tres periféricos
      // se apilan bajo el nodo y pisan la leyenda.
      const apertura = n === 1 ? Math.min(180, 50 * (k - 1) + 60) : Math.min(170, 34 * (k - 1) + 40);
      const radio = (n === 1 ? 150 : 110) + Math.max(0, k - 3) * 14;
      perifs.forEach((p, j) => {
        const a2 = 90 - apertura / 2 + (k === 1 ? apertura / 2 : (apertura * j) / (k - 1));
        const r2 = (a2 * Math.PI) / 180;
        N.push({
          id: p.id, nombre: p.nombre, categoria: p.categoria, estado: p.estado,
          detalle: p.detalle, tam: 34,
          x: x + Math.cos(r2) * radio * 1.3,
          y: y + Math.sin(r2) * radio,
        });
        A.push({ source: id, target: p.id, valor: p.bus, ancho: 1.4 });
      });
    });

    return { nodos: N, aristas: A };
  }, [dispositivos, silencioNube, soloNodo]);

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      ...TOOLTIP,
      formatter: (p: { dataType: string; data: Record<string, unknown> }) => {
        if (p.dataType === 'edge') return `<b>${(p.data as { valor?: string }).valor ?? 'enlace'}</b>`;
        const d = p.data as unknown as NodoMapa;
        const rotulo = { ok: 'en línea', aviso: 'con retraso', caido: 'sin respuesta', inerte: 'sin datos' }[d.estado];
        return `<div style="min-width:170px">
            <div style="font-weight:600;margin-bottom:2px">${d.nombre}</div>
            <div style="color:${COLOR_ESTADO[d.estado]};font-size:10px;margin-bottom:6px">● ${rotulo}</div>
            ${d.detalle.map((l) => `<div style="color:${COLORES.textoSec};font-size:11px">${l}</div>`).join('')}
          </div>`;
      },
    },
    legend: [{
      data: ['Nube', 'Gateway', 'Nodo', 'Sensores', 'Actuadores'],
      bottom: 2, textStyle: { color: COLORES.textoSec, fontSize: 10 },
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
        show: true, position: 'bottom' as const, color: COLORES.texto,
        fontSize: 10, distance: 5,
        formatter: (p: { data: unknown }) => (p.data as NodoMapa).nombre,
      },
      edgeLabel: {
        show: true, color: COLORES.textoTenue, fontSize: 9,
        formatter: (p: { data: unknown }) => (p.data as { valor?: string }).valor ?? '',
      },
      emphasis: {
        // Apaga todo menos el señalado y sus vecinos: con tres nodos y
        // sus periféricos es la diferencia entre ver de dónde cuelga
        // algo y adivinarlo.
        focus: 'adjacency' as const, scale: 1.08,
        label: { color: COLORES.texto, fontWeight: 'bold' as const },
        lineStyle: { width: 4, opacity: 1 },
      },
      data: nodos.map((n) => ({
        ...n, name: n.id, value: n.nombre, symbolSize: n.tam,
        category: { nube: 0, gateway: 1, nodo: 2, sensor: 3, actuador: 4 }[n.categoria],
        // El relleno lleva el rol y el anillo lleva el estado: dos
        // canales para dos cosas, si no un sensor caído no se vería.
        itemStyle: {
          color: sombra(COLOR_CATEGORIA[n.categoria], n.estado === 'inerte' ? 0.25 : 0.85),
          borderColor: COLOR_ESTADO[n.estado],
          borderWidth: n.estado === 'ok' ? 2 : 3,
          shadowBlur: n.estado === 'caido' ? 18 : 8,
          shadowColor: sombra(COLOR_ESTADO[n.estado], n.estado === 'caido' ? 0.7 : 0.3),
        },
      })),
      links: aristas.map((a) => ({
        source: a.source, target: a.target, valor: a.valor,
        lineStyle: {
          width: a.ancho, color: COLORES.borde, opacity: 0.9,
          curveness: a.curva ?? 0, type: a.guion ?? 'solid',
        },
      })),
      lineStyle: { color: COLORES.borde, curveness: 0 },
    }],
  }), [nodos, aristas]);

  const recolocar = () => ref.current?.getEchartsInstance().setOption(option, true);

  return (
    <div className="relative">
      <button
        onClick={recolocar}
        className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-md border
                   border-brand-border bg-bg-secondary/90 px-2 py-1 text-[11px]
                   text-text-secondary hover:text-text-primary transition-colors"
        title="Devolver cada aparato a su sitio"
      >
        <RotateCcw size={11} /> Recolocar
      </button>
      <Grafica
        ref={ref}
        option={option}
        style={{ height: alto, width: '100%', cursor: 'grab' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
