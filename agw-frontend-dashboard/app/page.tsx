import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import {
  Leaf, LogIn, ArrowRight, Sprout, Map as MapIcon, BookOpen, Users, Cpu,
  Sun, Waves, Timer, Thermometer, Droplets, Activity, Radio,
} from 'lucide-react';

import MapaColombia from '@/components/publico/MapaColombia';
import Plantas from '@/components/publico/Plantas';
import Comunidad from '@/components/publico/Comunidad';
import { SISTEMAS } from '@/components/publico/datos/sistemas';
import { PISOS } from '@/components/publico/datos/zonas';
import { CREDITOS } from '@/components/publico/datos/creditos';

/**
 * Portada pública.
 *
 * Imágenes primero, texto después. Las fotos de VitalCrop son propias
 * (public/img/vc); las de plantas, zonas y sistemas vienen de Wikimedia
 * Commons con su crédito al pie. Estática salvo tres islas de cliente:
 * el mapa, las fichas con filtro y la comunidad.
 */

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz'] });

export const metadata: Metadata = {
  title: 'VitalCrop · Cultivar en Colombia',
  description: 'Mapa agrícola de Colombia, fichas de plantas para ambiente controlado y una comunidad de cultivadores.',
};

const NAV = [
  { href: '#mapa',      texto: 'Mapa' },
  { href: '#sistemas',  texto: 'Sistemas' },
  { href: '#plantas',   texto: 'Plantas' },
  { href: '#comunidad', texto: 'Comunidad' },
  { href: '#proyecto',  texto: 'VitalCrop' },
];

/** Fotos propias del cultivo, en el orden en que se hizo. */
const GALERIA = [
  { src: '/img/vc/estructura-2.jpg',      pie: 'Enero · la estructura de madera' },
  { src: '/img/vc/caja-luz-1.jpg',        pie: 'La caja, el panel de luz y los tubos' },
  { src: '/img/vc/hierbabuena-tubo.jpg',  pie: 'Hierbabuena en raíz flotante' },
  { src: '/img/vc/raiz-2.jpg',            pie: 'Raíz sana: blanca y con pelo' },
  { src: '/img/vc/tira-ph.jpg',           pie: 'Tira de pH de la solución' },
  { src: '/img/vc/sensor.jpg',            pie: 'El nodo ESP32 midiendo' },
  { src: '/img/vc/bomba.jpg',             pie: 'Bomba y electroválvulas' },
  { src: '/img/vc/tanque.jpg',            pie: 'El tanque de solución' },
  { src: '/img/vc/panel-led.jpg',         pie: 'Panel LED de espectro completo' },
  { src: '/img/vc/ventilador.jpg',        pie: 'Ventilador: la luz genera calor' },
  { src: '/img/vc/maceta-tierra.jpg',     pie: 'La maceta de tierra, con nivel' },
  { src: '/img/vc/mata-3.jpg',            pie: 'Septiembre · lista para el corte' },
];

function Seccion({ id, eyebrow, titulo, children, ancho = false }: {
  id: string; eyebrow: string; titulo: string; children: React.ReactNode; ancho?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-14 border-t border-campo-linea">
      <div className={`mx-auto px-5 ${ancho ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-campo-verde">{eyebrow}</p>
        <h2 className="font-display text-3xl md:text-4xl text-campo-tinta mt-2 mb-7 text-balance leading-tight">{titulo}</h2>
        {children}
      </div>
    </section>
  );
}

function Nivel({ n, de = 3 }: { n: number; de?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} de ${de}`}>
      {Array.from({ length: de }).map((_, i) => (
        <span key={i} className={`w-3 h-1.5 rounded-sm ${i < n ? 'bg-campo-verde' : 'bg-campo-linea'}`} />
      ))}
    </span>
  );
}

export default function Portada() {
  return (
    <main className={`${fraunces.variable} min-h-screen bg-campo-hueso text-campo-tinta`}>
      {/* ── Cabecera ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-campo-linea bg-campo-hueso/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 h-14 flex items-center gap-6">
          <a href="#inicio" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-campo-verde flex items-center justify-center"><Leaf size={17} className="text-white" /></span>
            <span className="font-display text-lg text-campo-tinta">VitalCrop</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="px-3 py-1.5 rounded-lg text-sm text-campo-tinta-2 hover:text-campo-tinta hover:bg-campo-papel transition-colors">{n.texto}</a>
            ))}
          </nav>
          <Link href="/login" className="ml-auto flex items-center gap-1.5 rounded-lg bg-campo-tinta px-3.5 py-1.5 text-sm font-medium text-campo-hueso hover:bg-campo-verde-oscuro transition-colors">
            <LogIn size={14} /> Entrar al panel
          </Link>
        </div>
      </header>

      {/* ── Apertura: mosaico de fotos propias ──────────────── */}
      <section id="inicio" className="mx-auto max-w-7xl px-5 pt-10 pb-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-campo-verde">Cultivar en Colombia</p>
            <h1 className="font-display text-4xl md:text-5xl xl:text-6xl text-campo-tinta mt-3 leading-[1.05] text-balance">
              El clima no lo pone el calendario. Lo pone la altura.
            </h1>
            <p className="text-campo-tinta-2 mt-4 leading-relaxed max-w-md">
              Mapa de lo que se siembra en cada zona, fichas para cultivar bajo techo y una comunidad
              de cultivadores. VitalCrop es nuestra hierbabuena en la Sabana.
            </p>
            <div className="flex flex-wrap gap-2.5 mt-6">
              <a href="#mapa" className="inline-flex items-center gap-2 rounded-lg bg-campo-verde px-4 py-2.5 text-sm font-medium text-white hover:bg-campo-verde-oscuro transition-colors"><MapIcon size={15} /> Ver el mapa</a>
              <a href="#proyecto" className="inline-flex items-center gap-2 rounded-lg border border-campo-linea bg-campo-papel px-4 py-2.5 text-sm font-medium text-campo-tinta hover:border-campo-tinta-3 transition-colors"><Cpu size={15} /> El cultivo</a>
            </div>
            <dl className="flex flex-wrap gap-1.5 mt-7">
              {(Object.entries(PISOS) as [string, typeof PISOS[keyof typeof PISOS]][]).map(([k, p]) => (
                <div key={k} className="flex items-center gap-1.5 rounded-full border border-campo-linea bg-campo-papel pl-1.5 pr-3 py-1 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                  <dt className="font-semibold text-campo-tinta">{p.nombre}</dt>
                  <dd className="text-campo-tinta-3 tabular-nums">{p.altitud}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="grid grid-cols-3 grid-rows-2 gap-2 aspect-[3/2]">
            {[
              ['/img/vc/mata-2.jpg', 'col-span-2 row-span-2', 'Hierbabuena en el cultivo'],
              ['/img/vc/hoja-1.jpg', '', 'Hoja de hierbabuena'],
              ['/img/vc/raiz-1.jpg', '', 'Raíz en raíz flotante'],
            ].map(([src, cls, alt], i) => (
              <figure key={src} className={`relative rounded-2xl overflow-hidden ${cls}`}>
                <Image src={src} alt={alt} fill priority={i === 0} sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mapa ────────────────────────────────────────────── */}
      <Seccion id="mapa" eyebrow="Mapa agrícola" ancho titulo="Dieciséis zonas, cuatro pisos térmicos.">
        <MapaColombia />
      </Seccion>

      {/* ── Sistemas ────────────────────────────────────────── */}
      <Seccion id="sistemas" eyebrow="Sistemas de cultivo" ancho titulo="Cómo llega el agua a la raíz.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SISTEMAS.map((s) => (
            <article key={s.id} className={`rounded-2xl border bg-campo-papel overflow-hidden flex flex-col ${s.vitalcrop ? 'border-campo-verde' : 'border-campo-linea'}`}>
              <figure className="relative aspect-[16/10]">
                <Image src={s.imagen} alt={s.nombre} fill sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-campo-tinta/80 to-transparent">
                  <h3 className="font-display text-xl text-campo-hueso leading-tight">{s.nombre}</h3>
                </div>
                {s.vitalcrop && (
                  <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-campo-verde text-white text-[10px] font-semibold px-2 py-0.5"><Leaf size={10} /> VITALCROP</span>
                )}
              </figure>
              <div className="p-4">
                <p className="text-sm text-campo-tinta-2 leading-snug">{s.resumen}</p>
                <div className="grid grid-cols-2 gap-3 mt-3 text-[11px]">
                  <ul className="space-y-0.5 text-campo-tinta-2">{s.ventajas.slice(0, 2).map((v) => <li key={v} className="flex gap-1"><span className="text-campo-verde">+</span>{v}</li>)}</ul>
                  <ul className="space-y-0.5 text-campo-tinta-2">{s.limites.slice(0, 2).map((v) => <li key={v} className="flex gap-1"><span className="text-campo-azul">–</span>{v}</li>)}</ul>
                </div>
                <dl className="flex items-center gap-4 mt-3 pt-2.5 border-t border-campo-linea text-[11px] text-campo-tinta-3">
                  <div className="flex items-center gap-1.5"><dt>Inversión</dt><dd><Nivel n={s.inversion} /></dd></div>
                  <div className="flex items-center gap-1.5"><dt>Dificultad</dt><dd><Nivel n={s.dificultad} /></dd></div>
                  <span className="ml-auto text-campo-tinta truncate">{s.para}</span>
                </dl>
              </div>
            </article>
          ))}
        </div>
      </Seccion>

      {/* ── Plantas ─────────────────────────────────────────── */}
      <Seccion id="plantas" eyebrow="Fichas de plantas" ancho titulo="Temperatura, pH, conductividad, luz y ciclo.">
        <Plantas />
      </Seccion>

      {/* ── Comunidad ───────────────────────────────────────── */}
      <Seccion id="comunidad" eyebrow="Comunidad" ancho titulo="Lo que se pregunta quien cultiva.">
        <Comunidad />
      </Seccion>

      {/* ── El proyecto: galería ────────────────────────────── */}
      <Seccion id="proyecto" eyebrow="El cultivo de VitalCrop" ancho titulo="Hierbabuena en la Sabana, de enero a septiembre.">
        <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {GALERIA.map((g, i) => (
            <figure key={g.src} className={`relative rounded-2xl overflow-hidden group ${i === 0 || i === 5 ? 'md:col-span-2 md:row-span-2 aspect-square' : 'aspect-[4/3]'}`}>
              <Image src={g.src} alt={g.pie} fill sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              <figcaption className="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-campo-tinta/75 to-transparent text-[11px] text-campo-hueso">{g.pie}</figcaption>
            </figure>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-5">
          {[
            [Thermometer, 'Aire', 'HDC1080 · temperatura y humedad'],
            [Activity, 'Solución', 'Sonda TDS · conductividad cada 60 s'],
            [Droplets, 'Sustrato', 'Sensor de nivel · corta el llenado'],
            [Radio, 'Enlace', 'RSSI de cada trama'],
          ].map(([I, t, d]) => {
            const Icono = I as React.ElementType;
            return (
              <div key={t as string} className="flex items-center gap-3 rounded-xl border border-campo-linea bg-campo-papel px-4 py-3">
                <Icono size={16} className="text-campo-verde shrink-0" />
                <div><p className="text-sm font-semibold text-campo-tinta">{t as string}</p><p className="text-[11px] text-campo-tinta-3">{d as string}</p></div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
          {[
            [Sun, 'Luz', '06:00 → 18:00'], [Waves, 'Riego de día', '3 min cada 15'],
            [Waves, 'Riego de noche', '3 min cada 60'], [Timer, 'Tierra', 'cada 8 días · 07:00'],
          ].map(([I, t, v]) => {
            const Icono = I as React.ElementType;
            return (
              <div key={t as string} className="flex items-center gap-3 rounded-xl border border-campo-linea bg-campo-papel px-4 py-3">
                <Icono size={16} className="text-campo-azul shrink-0" />
                <p className="text-sm text-campo-tinta-2 flex-1">{t as string}</p>
                <p className="text-sm font-semibold text-campo-tinta tabular-nums">{v as string}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-campo-azul/30 bg-campo-azul-suave p-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-campo-tinta-2 max-w-lg">
            <span className="font-display text-xl text-campo-tinta block mb-1">El panel</span>
            Lecturas en vivo, mando de los actuadores y análisis del enlace. Requiere cuenta.
          </p>
          <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-campo-azul px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity">
            Iniciar sesión <ArrowRight size={15} />
          </Link>
        </div>
      </Seccion>

      <footer className="border-t border-campo-linea">
        <div className="mx-auto max-w-7xl px-5 py-8 text-[11px] text-campo-tinta-3 space-y-3">
          <p>VitalCrop AGW · Trabajo de grado · Infraestructura IoT y computación en la niebla para un cultivo indoor. Fotos del cultivo: propias.</p>
          <details>
            <summary className="cursor-pointer hover:text-campo-tinta">Créditos de las fotos de Wikimedia Commons ({CREDITOS.length})</summary>
            <ul className="mt-2 columns-1 md:columns-2 xl:columns-3 gap-6 space-y-1">
              {CREDITOS.map((c) => (
                <li key={c.ruta} className="break-inside-avoid">
                  <a href={c.url} className="hover:text-campo-azul hover:underline" target="_blank" rel="noopener noreferrer">{c.titulo}</a>
                  {' '}· {c.autor} · {c.licencia}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </footer>
    </main>
  );
}
