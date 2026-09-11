import Link from 'next/link';
import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import {
  Leaf, LogIn, ArrowRight, Sprout, Map as MapIcon, BookOpen, Users, Cpu,
  Sun, Waves, Timer, Thermometer, Droplets, Activity, Radio, Server, Cloud,
} from 'lucide-react';

import MapaColombia from '@/components/publico/MapaColombia';
import Plantas from '@/components/publico/Plantas';
import Comunidad from '@/components/publico/Comunidad';
import { SISTEMAS } from '@/components/publico/datos/sistemas';
import { PISOS, ZONAS } from '@/components/publico/datos/zonas';
import { PLANTAS } from '@/components/publico/datos/plantas';

/**
 * Portada pública.
 *
 * Una sola página con secciones ancladas. Estática en el servidor
 * salvo tres islas de cliente: el mapa, las fichas con filtro y la
 * comunidad. No pide nada a la API ni enseña ninguna medición en vivo;
 * eso vive detrás del login.
 *
 * El hilo del relato es agronómico: en Colombia el clima lo pone la
 * altura, la altura fija el piso térmico, el piso fija el cultivo y el
 * cultivo fija el sistema. VitalCrop entra al final de esa cadena como
 * un caso concreto —hierbabuena, piso frío, raíz flotante— y no como
 * el protagonista de toda la página.
 */

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  // Fuente variable: el peso va por CSS y no se declara aquí. `opsz`
  // hace que los titulares grandes salgan con serifas más finas.
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: 'VitalCrop · Cultivar en Colombia',
  description:
    'Qué se cultiva en cada zona de Colombia, con qué sistema y en qué condiciones. '
    + 'Mapa agrícola, fichas de plantas para ambiente controlado y una comunidad de cultivadores.',
};

const NAV = [
  { href: '#mapa',      texto: 'Mapa',      icono: MapIcon },
  { href: '#sistemas',  texto: 'Sistemas',  icono: Sprout },
  { href: '#plantas',   texto: 'Plantas',   icono: BookOpen },
  { href: '#comunidad', texto: 'Comunidad', icono: Users },
  { href: '#proyecto',  texto: 'VitalCrop', icono: Cpu },
];

function Seccion({ id, eyebrow, titulo, intro, children, ancho = false }: {
  id: string; eyebrow: string; titulo: string; intro: string; children: React.ReactNode; ancho?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 py-16 border-t border-campo-linea">
      <div className={`mx-auto px-5 ${ancho ? 'max-w-7xl' : 'max-w-6xl'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-campo-verde">{eyebrow}</p>
        <h2 className="font-display text-3xl md:text-4xl text-campo-tinta mt-2 text-balance leading-tight">{titulo}</h2>
        <p className="text-campo-tinta-2 mt-3 max-w-2xl leading-relaxed">{intro}</p>
        <div className="mt-8">{children}</div>
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
  const vc = ZONAS.find((z) => z.vitalcrop)!;
  const planta = PLANTAS.find((p) => p.vitalcrop)!;

  return (
    <main className={`${fraunces.variable} min-h-screen bg-campo-hueso text-campo-tinta`}>
      {/* ── Cabecera ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-campo-linea bg-campo-hueso/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 h-14 flex items-center gap-6">
          <a href="#inicio" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-campo-verde flex items-center justify-center">
              <Leaf size={17} className="text-white" />
            </span>
            <span className="font-display text-lg text-campo-tinta">VitalCrop</span>
          </a>
          <nav className="hidden md:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm text-campo-tinta-2 hover:text-campo-tinta hover:bg-campo-papel transition-colors">
                {n.texto}
              </a>
            ))}
          </nav>
          <Link href="/login"
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-campo-tinta px-3.5 py-1.5 text-sm font-medium text-campo-hueso hover:bg-campo-verde-oscuro transition-colors">
            <LogIn size={14} /> Entrar al panel
          </Link>
        </div>
      </header>

      {/* ── Apertura ────────────────────────────────────────── */}
      <section id="inicio" className="mx-auto max-w-7xl px-5 pt-14 pb-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-campo-verde">Cultivar en Colombia</p>
            <h1 className="font-display text-4xl md:text-6xl text-campo-tinta mt-3 leading-[1.05] text-balance">
              Aquí el clima no lo pone el calendario. Lo pone la altura.
            </h1>
            <p className="text-lg text-campo-tinta-2 mt-5 leading-relaxed max-w-xl">
              Un mapa de qué se siembra en cada zona del país, fichas para cultivar en ambiente
              controlado, y una comunidad que se pregunta cosas. VitalCrop es nuestro cultivo:
              hierbabuena en la Sabana, regada por un sistema que no necesita internet para vivir.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <a href="#mapa" className="inline-flex items-center gap-2 rounded-lg bg-campo-verde px-5 py-2.5 text-sm font-medium text-white hover:bg-campo-verde-oscuro transition-colors">
                <MapIcon size={15} /> Ver el mapa
              </a>
              <a href="#plantas" className="inline-flex items-center gap-2 rounded-lg border border-campo-linea bg-campo-papel px-5 py-2.5 text-sm font-medium text-campo-tinta hover:border-campo-tinta-3 transition-colors">
                <BookOpen size={15} /> Fichas de plantas
              </a>
            </div>
          </div>

          {/* Los cuatro pisos, que son la clave de lectura de todo lo demás */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 lg:w-[360px]">
            {(Object.entries(PISOS) as [string, typeof PISOS[keyof typeof PISOS]][]).map(([k, p]) => (
              <div key={k} className="rounded-xl border border-campo-linea bg-campo-papel p-3.5 relative overflow-hidden">
                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: p.color }} />
                <dt className="text-sm font-semibold text-campo-tinta pl-2">{p.nombre}</dt>
                <dd className="text-xs text-campo-tinta-2 mt-1 pl-2 tabular-nums">{p.altitud}<br />{p.temperatura}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Mapa ────────────────────────────────────────────── */}
      <Seccion id="mapa" eyebrow="Mapa agrícola" ancho
        titulo="Dieciséis zonas, cuatro pisos, un país que cultiva de 0 a 3.200 metros."
        intro="Cada punto es una zona productora real, con su altitud, su piso térmico y sus cultivos principales. Filtra por piso para ver cómo el mismo país cambia de cultivo cada mil metros.">
        <MapaColombia />
      </Seccion>

      {/* ── Sistemas ────────────────────────────────────────── */}
      <Seccion id="sistemas" eyebrow="Sistemas de cultivo"
        titulo="Cómo llega el agua a la raíz decide casi todo lo demás."
        intro="De la tierra con goteo a la aeroponía. Ninguno es mejor en abstracto: cada uno intercambia inversión y margen de error por velocidad y control.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SISTEMAS.map((s) => (
            <article key={s.id} className={`rounded-2xl border bg-campo-papel p-5 flex flex-col ${
              s.vitalcrop ? 'border-campo-verde' : 'border-campo-linea'}`}>
              <header className="flex items-start justify-between gap-3">
                <h3 className="font-display text-xl text-campo-tinta leading-tight">{s.nombre}</h3>
                {s.vitalcrop && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-campo-verde text-white text-[10px] font-semibold px-2 py-0.5 shrink-0">
                    <Leaf size={10} /> VITALCROP
                  </span>
                )}
              </header>
              <p className="text-sm text-campo-tinta-2 mt-2 leading-relaxed">{s.resumen}</p>
              <p className="text-sm text-campo-tinta-2 mt-3 leading-relaxed">{s.como}</p>
              <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                <div>
                  <p className="font-semibold text-campo-verde mb-1">A favor</p>
                  <ul className="space-y-1 text-campo-tinta-2">{s.ventajas.map((v) => <li key={v}>· {v}</li>)}</ul>
                </div>
                <div>
                  <p className="font-semibold text-campo-azul mb-1">Límites</p>
                  <ul className="space-y-1 text-campo-tinta-2">{s.limites.map((v) => <li key={v}>· {v}</li>)}</ul>
                </div>
              </div>
              <dl className="flex items-center gap-5 mt-4 pt-3 border-t border-campo-linea text-[11px] text-campo-tinta-3">
                <div className="flex items-center gap-2"><dt>Inversión</dt><dd><Nivel n={s.inversion} /></dd></div>
                <div className="flex items-center gap-2"><dt>Dificultad</dt><dd><Nivel n={s.dificultad} /></dd></div>
              </dl>
              <p className="text-xs text-campo-tinta mt-3"><span className="text-campo-tinta-3">Para</span> {s.para}</p>
            </article>
          ))}
        </div>
      </Seccion>

      {/* ── Plantas ─────────────────────────────────────────── */}
      <Seccion id="plantas" eyebrow="Fichas de plantas" ancho
        titulo="Cinco números por planta: temperatura, pH, conductividad, luz y ciclo."
        intro="Son los rangos de manejo en hidroponía, no umbrales de alerta. Las barras están en la misma escala en todas las fichas: la lechuga y el tomate no se parecen en nada, y eso se ve sin leer.">
        <Plantas />
      </Seccion>

      {/* ── Comunidad ───────────────────────────────────────── */}
      <Seccion id="comunidad" eyebrow="Comunidad" ancho
        titulo="Lo que se pregunta quien cultiva."
        intro="Hilos por tema. Puedes responder: por ahora la comunidad no guarda nada y lo que escribas vive solo en tu pestaña, pero ya se puede usar para ver cómo funcionará.">
        <Comunidad />
      </Seccion>

      {/* ── El proyecto ─────────────────────────────────────── */}
      <Seccion id="proyecto" eyebrow="El cultivo de VitalCrop"
        titulo={`${planta.nombre} en la Sabana, cuidada por un sistema que sigue funcionando sin internet.`}
        intro={`${planta.cientifico} en raíz flotante, a ${vc.altitud}, en el piso ${PISOS[vc.piso].nombre.toLowerCase()}. Dos nodos ESP32 miden y actúan; un gateway en Raspberry Pi decide en el borde y guarda si se cae la nube.`}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icono: Cpu, color: 'bg-campo-verde', titulo: 'Dos nodos ESP32', texto: 'Miden temperatura, humedad, conductividad y nivel. Riegan solos: el programa vive en su memoria.' },
            { icono: Server, color: 'bg-campo-azul', titulo: 'Un gateway de niebla', texto: 'Raspberry Pi con broker MQTT, punto de acceso propio y buffer local. Si cae internet, guarda y reenvía.' },
            { icono: Cloud, color: 'bg-campo-tinta', titulo: 'La nube', texto: 'API y base de datos gestionadas. Histórico, análisis del enlace y el panel privado.' },
          ].map((c) => (
            <article key={c.titulo} className="rounded-2xl border border-campo-linea bg-campo-papel p-5">
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center mb-3`}>
                <c.icono size={17} className="text-white" />
              </div>
              <h3 className="font-semibold text-campo-tinta">{c.titulo}</h3>
              <p className="text-sm text-campo-tinta-2 leading-relaxed mt-1.5">{c.texto}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <div className="rounded-2xl border border-campo-linea bg-campo-papel p-5">
            <h3 className="font-semibold text-campo-tinta mb-3">Lo que se mide</h3>
            <ul className="divide-y divide-campo-linea text-sm">
              {[
                [Thermometer, 'Temperatura del aire', 'HDC1080 · I²C'],
                [Droplets, 'Humedad relativa', 'HDC1080 · I²C'],
                [Activity, 'Conductividad', 'Sonda TDS · cada 60 s'],
                [Waves, 'Agua en el sustrato', 'Sensor de nivel'],
                [Radio, 'Calidad del enlace', 'RSSI de cada trama'],
              ].map(([I, n, c]) => {
                const Icono = I as React.ElementType;
                return (
                  <li key={n as string} className="flex items-center gap-3 py-2.5">
                    <Icono size={14} className="text-campo-tinta-3 shrink-0" />
                    <span className="flex-1 text-campo-tinta">{n as string}</span>
                    <span className="text-[11px] text-campo-tinta-3 font-mono">{c as string}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-2xl border border-campo-linea bg-campo-papel p-5">
            <h3 className="font-semibold text-campo-tinta mb-3">El programa del cultivo</h3>
            <ul className="divide-y divide-campo-linea text-sm">
              {[
                [Sun, 'Luz', '06:00 → 18:00'],
                [Waves, 'Riego de día', '3 min cada 15'],
                [Waves, 'Riego de noche', '3 min cada 60'],
                [Timer, 'Llenado de tierra', 'cada 8 días · 07:00'],
              ].map(([I, n, v]) => {
                const Icono = I as React.ElementType;
                return (
                  <li key={n as string} className="flex items-center gap-3 py-2.5">
                    <Icono size={14} className="text-campo-tinta-3 shrink-0" />
                    <span className="flex-1 text-campo-tinta">{n as string}</span>
                    <span className="text-sm font-medium text-campo-tinta tabular-nums">{v as string}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-campo-tinta-3 mt-3 leading-relaxed">
              El pH quedó fuera del alcance experimental: la ruta está implementada, la sonda no se instaló.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-campo-azul/30 bg-campo-azul-suave p-6 md:p-8
                        flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-lg">
            <h3 className="font-display text-2xl text-campo-tinta">El panel</h3>
            <p className="text-sm text-campo-tinta-2 mt-1.5 leading-relaxed">
              Lecturas en vivo, la ficha de cada nodo, el mando de los actuadores y el análisis del enlace. Requiere cuenta.
            </p>
          </div>
          <Link href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-campo-azul px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity">
            Iniciar sesión <ArrowRight size={15} />
          </Link>
        </div>
      </Seccion>

      <footer className="border-t border-campo-linea">
        <div className="mx-auto max-w-7xl px-5 py-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-campo-tinta-3">
          <p>VitalCrop AGW · Trabajo de grado · Infraestructura IoT y computación en la niebla para un cultivo indoor.</p>
          <p>Zonas y cultivos según las evaluaciones agropecuarias del Ministerio de Agricultura. Fichas: rangos de manejo en hidroponía.</p>
        </div>
      </footer>
    </main>
  );
}
