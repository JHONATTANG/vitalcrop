'use client';

/**
 * Fichas de plantas: foto, cuatro barras y una línea de consejo.
 *
 * Las barras van sobre una escala común para que se comparen de un
 * vistazo. Todo lo demás se quitó: la foto y los rangos dicen más que
 * un párrafo, y el consejo se queda porque es lo único que no está en
 * ninguna otra parte.
 */
import { useState } from 'react';
import Image from 'next/image';
import { Leaf, Sun, Droplets, FlaskConical, Thermometer, Clock } from 'lucide-react';
import { PLANTAS, type Planta } from './datos/plantas';
import { PISOS, type Piso } from './datos/zonas';

const ESCALA = {
  temperatura: [10, 30] as const,
  ph:          [5.0, 7.5] as const,
  ec:          [0.5, 4.0] as const,
  luz:         [8, 18] as const,
};

function Barra({ icono: Icono, valor, escala, unidad, color }: {
  icono: React.ElementType; valor: readonly [number, number];
  escala: readonly [number, number]; unidad: string; color: string;
}) {
  const a = ((valor[0] - escala[0]) / (escala[1] - escala[0])) * 100;
  const b = ((valor[1] - escala[0]) / (escala[1] - escala[0])) * 100;
  return (
    <div className="flex items-center gap-2">
      <Icono size={12} className="text-campo-tinta-3 shrink-0" />
      <div className="relative h-1.5 rounded-full bg-campo-linea flex-1">
        <div className="absolute inset-y-0 rounded-full" style={{ left: `${a}%`, width: `${b - a}%`, background: color }} />
      </div>
      <span className="text-[11px] text-campo-tinta tabular-nums w-[88px] text-right">
        {valor[0]}–{valor[1]} <span className="text-campo-tinta-3">{unidad}</span>
      </span>
    </div>
  );
}

function Ficha({ p }: { p: Planta }) {
  return (
    <article className={`rounded-2xl border bg-campo-papel overflow-hidden flex flex-col ${
      p.vitalcrop ? 'border-campo-verde shadow-[0_0_0_3px_rgba(30,122,70,.12)]' : 'border-campo-linea'}`}>
      <figure className="relative aspect-[4/3]">
        <Image src={p.imagen} alt={p.nombre} fill sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
        <div className="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-campo-tinta/80 to-transparent">
          <h3 className="font-display text-xl text-campo-hueso leading-tight">{p.nombre}</h3>
          <p className="text-[11px] italic text-campo-hueso/80">{p.cientifico}</p>
        </div>
        {p.vitalcrop && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-campo-verde text-white text-[10px] font-semibold px-2 py-0.5">
            <Leaf size={10} /> VITALCROP
          </span>
        )}
        <div className="absolute top-2.5 left-2.5 flex gap-1">
          {p.piso.map((x) => (
            <span key={x} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: PISOS[x].color }}>
              {PISOS[x].nombre}
            </span>
          ))}
        </div>
      </figure>

      <div className="p-4 space-y-2">
        <Barra icono={Thermometer} valor={p.temperatura} escala={ESCALA.temperatura} unidad="°C" color="#D98E32" />
        <Barra icono={Droplets} valor={p.ph} escala={ESCALA.ph} unidad="pH" color="#2A6FBF" />
        <Barra icono={FlaskConical} valor={p.ec} escala={ESCALA.ec} unidad="mS/cm" color="#2E9E5B" />
        <Barra icono={Sun} valor={p.luz} escala={ESCALA.luz} unidad="h luz" color="#C9A227" />
        <p className="text-[11px] text-campo-tinta-2 flex items-center gap-1.5 pt-1">
          <Clock size={11} className="shrink-0" /> {p.ciclo}
        </p>
        <p className="text-xs text-campo-tinta leading-snug pt-2 border-t border-campo-linea">
          <span className="font-semibold text-campo-verde">Consejo · </span>{p.consejo}
        </p>
      </div>
    </article>
  );
}

export default function Plantas() {
  const [piso, setPiso] = useState<Piso | 'todos'>('todos');
  const lista = PLANTAS.filter((p) => piso === 'todos' || p.piso.includes(piso));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <button onClick={() => setPiso('todos')}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            piso === 'todos' ? 'bg-campo-tinta text-campo-hueso border-campo-tinta' : 'border-campo-linea text-campo-tinta-2'}`}>
          Cualquier clima
        </button>
        {(Object.keys(PISOS) as Piso[]).map((x) => (
          <button key={x} onClick={() => setPiso(piso === x ? 'todos' : x)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              piso === x ? 'text-white border-transparent' : 'border-campo-linea text-campo-tinta-2'}`}
            style={piso === x ? { background: PISOS[x].color } : undefined}>
            {PISOS[x].nombre}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {lista.map((p) => <Ficha key={p.id} p={p} />)}
      </div>
    </div>
  );
}
