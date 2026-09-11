'use client';

/**
 * Fichas de plantas con filtro por piso térmico.
 *
 * Cada ficha enseña las cinco variables de manejo como barras sobre
 * un rango común, para que se comparen de un vistazo: la lechuga y el
 * tomate no se parecen en nada y eso se tiene que ver sin leer.
 */
import { useState } from 'react';
import { Leaf, Sun, Droplets, FlaskConical, Thermometer, Clock } from 'lucide-react';
import { PLANTAS, type Planta } from './datos/plantas';
import { PISOS, type Piso } from './datos/zonas';

/** Rango total de cada variable, para dibujar la barra en escala común. */
const ESCALA = {
  temperatura: [10, 30] as const,
  ph:          [5.0, 7.5] as const,
  ec:          [0.5, 4.0] as const,
  luz:         [8, 18] as const,
};

function Barra({ icono: Icono, nombre, valor, escala, unidad, color }: {
  icono: React.ElementType; nombre: string; valor: readonly [number, number];
  escala: readonly [number, number]; unidad: string; color: string;
}) {
  const a = ((valor[0] - escala[0]) / (escala[1] - escala[0])) * 100;
  const b = ((valor[1] - escala[0]) / (escala[1] - escala[0])) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-campo-tinta-2 flex items-center gap-1.5"><Icono size={12} /> {nombre}</span>
        <span className="text-campo-tinta font-medium tabular-nums">
          {valor[0]}–{valor[1]} <span className="text-campo-tinta-3 font-normal">{unidad}</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-campo-linea mt-1.5">
        <div className="absolute inset-y-0 rounded-full" style={{ left: `${a}%`, width: `${b - a}%`, background: color }} />
      </div>
    </div>
  );
}

function Ficha({ p }: { p: Planta }) {
  return (
    <article className={`rounded-2xl border bg-campo-papel p-5 flex flex-col ${
      p.vitalcrop ? 'border-campo-verde shadow-[0_0_0_3px_rgba(30,122,70,.12)]' : 'border-campo-linea'}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-campo-tinta leading-tight">{p.nombre}</h3>
          <p className="text-xs italic text-campo-tinta-3 mt-0.5">{p.cientifico} · {p.familia}</p>
        </div>
        {p.vitalcrop && (
          <span className="inline-flex items-center gap-1 rounded-full bg-campo-verde text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
            <Leaf size={10} /> VITALCROP
          </span>
        )}
      </header>

      <div className="flex flex-wrap gap-1 mt-3">
        {p.piso.map((x) => (
          <span key={x} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: PISOS[x].color }}>
            {PISOS[x].nombre}
          </span>
        ))}
        {p.sistemas.map((s) => (
          <span key={s} className="rounded-full px-2 py-0.5 text-[10px] font-medium border border-campo-linea text-campo-tinta-2">{s}</span>
        ))}
      </div>

      <div className="space-y-3 mt-4">
        <Barra icono={Thermometer} nombre="Temperatura" valor={p.temperatura} escala={ESCALA.temperatura} unidad="°C" color="#D98E32" />
        <Barra icono={Droplets} nombre="pH de la solución" valor={p.ph} escala={ESCALA.ph} unidad="" color="#2A6FBF" />
        <Barra icono={FlaskConical} nombre="Conductividad" valor={p.ec} escala={ESCALA.ec} unidad="mS/cm" color="#2E9E5B" />
        <Barra icono={Sun} nombre="Luz" valor={p.luz} escala={ESCALA.luz} unidad="h/día" color="#C9A227" />
      </div>

      <p className="text-xs text-campo-tinta-2 mt-4 flex items-start gap-1.5">
        <Clock size={12} className="mt-0.5 shrink-0" /> {p.ciclo}
      </p>
      <p className="text-sm text-campo-tinta-2 leading-relaxed mt-3">{p.uso}</p>
      <p className="text-xs text-campo-tinta leading-relaxed mt-3 pt-3 border-t border-campo-linea">
        <span className="font-semibold text-campo-verde">Consejo · </span>{p.consejo}
      </p>
    </article>
  );
}

export default function Plantas() {
  const [piso, setPiso] = useState<Piso | 'todos'>('todos');
  const lista = PLANTAS.filter((p) => piso === 'todos' || p.piso.includes(piso));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <span className="text-xs text-campo-tinta-3 mr-1">Para clima</span>
        <button onClick={() => setPiso('todos')}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            piso === 'todos' ? 'bg-campo-tinta text-campo-hueso border-campo-tinta' : 'border-campo-linea text-campo-tinta-2'}`}>
          Cualquiera
        </button>
        {(Object.keys(PISOS) as Piso[]).map((x) => (
          <button key={x} onClick={() => setPiso(piso === x ? 'todos' : x)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              piso === x ? 'text-white border-transparent' : 'border-campo-linea text-campo-tinta-2'}`}
            style={piso === x ? { background: PISOS[x].color } : undefined}>
            {PISOS[x].nombre}
          </button>
        ))}
        <span className="text-xs text-campo-tinta-3 ml-auto tabular-nums">{lista.length} de {PLANTAS.length}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {lista.map((p) => <Ficha key={p.id} p={p} />)}
      </div>
    </div>
  );
}
