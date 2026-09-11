'use client';

/**
 * Mapa agrícola de Colombia.
 *
 * SVG propio y no una librería de mapas: los 32 departamentos vienen
 * ya simplificados y proyectados como trazos (45 KB), así que el
 * navegador no calcula nada y el estilo se controla entero desde aquí.
 * La proyección es equirectangular con corrección por la latitud
 * media; a 4° del ecuador la distorsión es despreciable.
 *
 * Tres capas: los departamentos (se iluminan al pasar, se seleccionan
 * al hacer clic), las zonas productoras (un punto por zona, coloreado
 * por piso térmico) y VitalCrop, que va aparte porque es el único
 * punto que no es una región sino un cultivo concreto.
 *
 * San Andrés y Providencia no aparecen: están a 700 km de la costa y
 * meterlas en el encuadre encogía el continente a la mitad.
 */
import { useMemo, useState } from 'react';
import { Leaf, Mountain, Thermometer, X } from 'lucide-react';
import mapa from './datos/colombia.json';
import { ZONAS, PISOS, type Zona, type Piso } from './datos/zonas';

interface Depto { n: string; c: string; d: string; cx: number; cy: number }
const { meta, deptos } = mapa as { meta: { lat0: number; x0: number; y0: number; k: number; w: number; h: number }; deptos: Depto[] };

/** lon/lat → coordenadas del viewBox, con la misma proyección del build. */
function xy(lon: number, lat: number): [number, number] {
  const x = lon * Math.cos((meta.lat0 * Math.PI) / 180);
  return [(x - meta.x0) * meta.k, (-lat - meta.y0) * meta.k];
}

/** Qué zonas caen en cada departamento, por nombre. Aproximado: sirve para el panel. */
const ZONAS_POR_DEPTO = (nombre: string) =>
  ZONAS.filter((z) => z.departamento.toLowerCase().includes(nombre.toLowerCase().split(' ')[0]));

export default function MapaColombia() {
  const [hover, setHover] = useState<string | null>(null);
  const [depto, setDepto] = useState<string | null>(null);
  const [zona, setZona] = useState<Zona | null>(ZONAS.find((z) => z.vitalcrop) ?? null);
  const [filtro, setFiltro] = useState<Piso | 'todos'>('todos');

  const puntos = useMemo(() => ZONAS.map((z) => ({ z, p: xy(z.lon, z.lat) })), []);
  const visibles = puntos.filter(({ z }) => filtro === 'todos' || z.piso === filtro);
  const zonasDelDepto = depto ? ZONAS_POR_DEPTO(depto) : [];

  const elegir = (z: Zona) => { setZona(z); setDepto(null); };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] items-start">
      {/* ── Mapa ──────────────────────────────────────────────── */}
      <div className="relative">
        {/* Filtro por piso térmico */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <button onClick={() => setFiltro('todos')}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              filtro === 'todos' ? 'bg-campo-tinta text-campo-hueso border-campo-tinta'
                : 'border-campo-linea text-campo-tinta-2 hover:border-campo-tinta-3'}`}>
            Todos los pisos
          </button>
          {(Object.keys(PISOS) as Piso[]).map((p) => (
            <button key={p} onClick={() => setFiltro(filtro === p ? 'todos' : p)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                filtro === p ? 'text-white border-transparent' : 'border-campo-linea text-campo-tinta-2 hover:border-campo-tinta-3'}`}
              style={filtro === p ? { background: PISOS[p].color } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: filtro === p ? '#fff' : PISOS[p].color }} />
              {PISOS[p].nombre} <span className="opacity-60 font-normal">{PISOS[p].altitud}</span>
            </button>
          ))}
        </div>

        <svg viewBox={`0 0 ${meta.w} ${meta.h}`} className="w-full h-auto max-h-[720px] mx-auto select-none"
          role="img" aria-label="Mapa de Colombia con las zonas agrícolas">
          <defs>
            <filter id="sombra-pin" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1B2A1F" floodOpacity=".25" />
            </filter>
          </defs>

          {/* Departamentos */}
          <g>
            {deptos.map((d) => {
              const activo = depto === d.n;
              const sobre = hover === d.n;
              return (
                <path key={d.c} d={d.d}
                  fill={activo ? '#CFE9D6' : sobre ? '#E3F0E6' : '#EFEAE0'}
                  stroke={activo ? '#1E7A46' : '#C9C0AC'}
                  strokeWidth={activo ? 2.2 : 1}
                  strokeLinejoin="round"
                  className="cursor-pointer transition-[fill] duration-150"
                  onMouseEnter={() => setHover(d.n)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { setDepto(activo ? null : d.n); setZona(null); }}
                >
                  <title>{d.n}</title>
                </path>
              );
            })}
          </g>

          {/* Zonas productoras */}
          <g>
            {visibles.map(({ z, p: [x, y] }) => {
              const sel = zona?.id === z.id;
              const color = PISOS[z.piso].color;
              if (z.vitalcrop) return null;
              return (
                <g key={z.id} className="cursor-pointer" onClick={() => elegir(z)}
                  onMouseEnter={() => setHover(null)}>
                  <circle cx={x} cy={y} r={sel ? 30 : 22} fill={color} opacity={sel ? .22 : .14} />
                  <circle cx={x} cy={y} r={sel ? 12 : 9} fill={color} stroke="#FBF9F4" strokeWidth={3} />
                  <title>{z.nombre}</title>
                </g>
              );
            })}
          </g>

          {/* VitalCrop */}
          {puntos.filter(({ z }) => z.vitalcrop && (filtro === 'todos' || z.piso === filtro)).map(({ z, p: [x, y] }) => {
            const sel = zona?.id === z.id;
            return (
              <g key={z.id} className="cursor-pointer" onClick={() => elegir(z)} filter="url(#sombra-pin)">
                <circle cx={x} cy={y} r={sel ? 44 : 36} fill="#1E7A46" opacity=".16">
                  <animate attributeName="r" values={`${sel ? 40 : 32};${sel ? 52 : 44};${sel ? 40 : 32}`} dur="2.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".2;.05;.2" dur="2.8s" repeatCount="indefinite" />
                </circle>
                <circle cx={x} cy={y} r={17} fill="#1E7A46" stroke="#FBF9F4" strokeWidth={4} />
                <path transform={`translate(${x - 8} ${y - 8}) scale(.67)`} fill="#FBF9F4"
                  d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6" stroke="#FBF9F4" strokeWidth="1.5" fillOpacity=".95" />
                <title>VitalCrop · {z.nombre}</title>
              </g>
            );
          })}
        </svg>

        <p className="text-[11px] text-campo-tinta-3 mt-2">
          Pasa por un departamento y haz clic para ver qué se cultiva; cada punto es una zona productora,
          coloreada por su piso térmico. La hoja es VitalCrop.
        </p>
      </div>

      {/* ── Panel ─────────────────────────────────────────────── */}
      <aside className="lg:sticky lg:top-24 rounded-2xl border border-campo-linea bg-campo-papel p-5 min-h-[320px]">
        {zona ? (
          <ZonaPanel z={zona} onCerrar={() => setZona(null)} />
        ) : depto ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[.12em] text-campo-tinta-3">Departamento</p>
                <h3 className="font-display text-2xl text-campo-tinta mt-1">{depto}</h3>
              </div>
              <button onClick={() => setDepto(null)} className="p-1.5 rounded-lg text-campo-tinta-3 hover:bg-campo-hueso" aria-label="Cerrar">
                <X size={16} />
              </button>
            </div>
            {zonasDelDepto.length ? (
              <ul className="mt-4 space-y-2">
                {zonasDelDepto.map((z) => (
                  <li key={z.id}>
                    <button onClick={() => elegir(z)}
                      className="w-full text-left rounded-xl border border-campo-linea bg-campo-hueso/60 px-4 py-3 hover:border-campo-verde transition-colors">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: PISOS[z.piso].color }} />
                        <span className="text-sm font-semibold text-campo-tinta">{z.nombre}</span>
                        {z.vitalcrop && <Leaf size={13} className="text-campo-verde" />}
                      </span>
                      <span className="block text-xs text-campo-tinta-2 mt-1">{z.cultivos.slice(0, 3).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-campo-tinta-2 mt-4 leading-relaxed">
                Todavía no hay una zona descrita en este departamento. Cada departamento del país tiene
                cultivo; el mapa recoge las zonas de mayor peso, no todas.
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm text-campo-tinta-2 leading-relaxed">
            <p className="font-display text-2xl text-campo-tinta">Un país de pisos, no de estaciones</p>
            <p className="mt-3">
              A 4° del ecuador no hay verano ni invierno: el clima lo pone la altura. Cada 1.000 m
              que se sube, la temperatura media baja unos 6 °C, y con ella cambia todo lo que se puede
              sembrar. Por eso el mapa se lee por colores y no por latitud.
            </p>
            <p className="mt-3">Toca un punto o un departamento.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function ZonaPanel({ z, onCerrar }: { z: Zona; onCerrar: () => void }) {
  const piso = PISOS[z.piso];
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[.12em] text-campo-tinta-3">{z.departamento}</p>
          <h3 className="font-display text-2xl text-campo-tinta mt-1 flex items-center gap-2">
            {z.nombre}
            {z.vitalcrop && (
              <span className="inline-flex items-center gap-1 rounded-full bg-campo-verde text-white text-[10px] font-semibold px-2 py-0.5 tracking-wide">
                <Leaf size={10} /> VITALCROP
              </span>
            )}
          </h3>
        </div>
        <button onClick={onCerrar} className="p-1.5 rounded-lg text-campo-tinta-3 hover:bg-campo-hueso shrink-0" aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-2 mt-4">
        <div className="rounded-xl px-3 py-2.5 text-white" style={{ background: piso.color }}>
          <dt className="text-[10px] uppercase tracking-wider opacity-80 flex items-center gap-1"><Thermometer size={10} /> Piso térmico</dt>
          <dd className="text-sm font-semibold mt-0.5">{piso.nombre} · {piso.temperatura}</dd>
        </div>
        <div className="rounded-xl px-3 py-2.5 bg-campo-hueso border border-campo-linea">
          <dt className="text-[10px] uppercase tracking-wider text-campo-tinta-3 flex items-center gap-1"><Mountain size={10} /> Altitud</dt>
          <dd className="text-sm font-semibold text-campo-tinta mt-0.5 tabular-nums">{z.altitud}</dd>
        </div>
      </dl>

      <p className="text-[11px] uppercase tracking-[.12em] text-campo-tinta-3 mt-5 mb-2">Cultivos principales</p>
      <ol className="flex flex-wrap gap-1.5">
        {z.cultivos.map((c, i) => (
          <li key={c} className={`rounded-full px-3 py-1 text-xs font-medium border ${
            i === 0 ? 'bg-campo-verde text-white border-campo-verde' : 'bg-campo-hueso border-campo-linea text-campo-tinta'}`}>
            {c}
          </li>
        ))}
      </ol>

      <p className="text-sm text-campo-tinta-2 leading-relaxed mt-4">{z.nota}</p>

      {z.vitalcrop && (
        <a href="#proyecto" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-campo-azul hover:underline">
          Ver el cultivo de VitalCrop →
        </a>
      )}
    </div>
  );
}
