import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Leaf, Server, Cpu, Cloud, Thermometer, Droplets, Activity, Sun,
  Radio, ArrowRight, LogIn, Waves, Timer, Layers,
} from 'lucide-react';

/**
 * Portada pública.
 *
 * Lo que puede leer cualquiera sin cuenta: qué cultivo es, qué planta
 * lleva, cómo está montado el sistema y con qué programa se riega. No
 * enseña ninguna medición en vivo ni ningún mando: eso vive detrás del
 * login. Los números de aquí son los del programa configurado, no
 * lecturas, así que no cambian con el estado del cultivo.
 *
 * Es un componente de servidor a propósito: no pide nada a la API, no
 * lleva estado, y se sirve estática.
 */

export const metadata: Metadata = {
  title: 'VitalCrop AGW — Cultivo indoor de hierbabuena',
  description:
    'Cultivo hidropónico de hierbabuena en ambiente controlado, con dos nodos '
    + 'ESP32, un gateway de niebla en Raspberry Pi y análisis del enlace IoT.',
};

const CAPAS = [
  {
    icono: Cpu, color: 'text-brand-green', fondo: 'bg-brand-green/15',
    titulo: 'Dos nodos ESP32',
    texto: 'Miden y actúan sobre el cultivo. Publican por MQTT y siguen regando aunque se queden solos.',
  },
  {
    icono: Server, color: 'text-brand-blue', fondo: 'bg-brand-blue/15',
    titulo: 'Un gateway de niebla',
    texto: 'Raspberry Pi con broker MQTT, punto de acceso propio y buffer local. Si cae internet, guarda y reenvía.',
  },
  {
    icono: Cloud, color: 'text-violet-400', fondo: 'bg-violet-500/15',
    titulo: 'La nube',
    texto: 'API y base de datos gestionadas. Histórico, análisis del enlace y el panel que estás por abrir.',
  },
];

const VARIABLES = [
  { icono: Thermometer, nombre: 'Temperatura del aire', como: 'HDC1080 · I²C' },
  { icono: Droplets,    nombre: 'Humedad relativa',     como: 'HDC1080 · I²C' },
  { icono: Activity,    nombre: 'Conductividad',        como: 'Sonda TDS · cada 60 s' },
  { icono: Waves,       nombre: 'Agua en el sustrato',  como: 'Sensor de nivel' },
  { icono: Radio,       nombre: 'Calidad del enlace',   como: 'RSSI de cada trama' },
];

const PROGRAMA = [
  { icono: Sun,   nombre: 'Luz',               valor: '06:00 → 18:00' },
  { icono: Waves, nombre: 'Riego de día',      valor: '3 min cada 15' },
  { icono: Waves, nombre: 'Riego de noche',    valor: '3 min cada 60' },
  { icono: Timer, nombre: 'Llenado de tierra', valor: 'cada 8 días · 07:00' },
];

export default function Portada() {
  return (
    <main className="min-h-screen bg-bg-primary text-text-primary">
      {/* ── Cabecera ────────────────────────────────────────── */}
      <header className="border-b border-brand-border">
        <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-brand-green/20 flex items-center justify-center">
              <Leaf size={17} className="text-brand-green" />
            </span>
            <span className="text-sm font-bold">VitalCrop AGW</span>
          </span>
          <Link href="/login"
            className="flex items-center gap-1.5 rounded-lg border border-brand-border
                       bg-bg-card px-3 py-1.5 text-xs font-medium text-text-secondary
                       hover:text-text-primary hover:border-brand-blue/50 transition-colors">
            <LogIn size={13} /> Entrar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5">
        {/* ── Apertura ──────────────────────────────────────── */}
        <section className="pt-14 pb-12 grid gap-8 md:grid-cols-[1.4fr_1fr] items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-brand-green mb-3">
              Cultivo en ambiente controlado
            </p>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight text-balance">
              Hierbabuena cultivada por un sistema que sigue funcionando cuando se queda sin internet.
            </h1>
            <p className="text-sm text-text-secondary mt-4 max-w-xl leading-relaxed">
              <em className="not-italic text-text-primary">Mentha spicata</em> en raíz flotante,
              con riego, luz y llenado del sustrato decididos en el borde. La nube guarda y
              analiza; el cultivo no depende de ella para vivir.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-brand-border bg-brand-border">
            {[
              ['Especie', 'Mentha spicata'],
              ['Sistema', 'Hidroponía · raíz flotante'],
              ['Nodos', '2 ESP32 + 1 gateway'],
              ['Cadencia', 'una trama cada 5 min'],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg-card px-4 py-3">
                <dt className="text-[10px] uppercase tracking-wider text-text-muted">{k}</dt>
                <dd className="text-sm font-medium mt-0.5">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Cómo está montado ─────────────────────────────── */}
        <section className="py-10 border-t border-brand-border">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
            <Layers size={17} className="text-text-muted" /> Tres capas, una decisión en cada una
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {CAPAS.map((c) => (
              <article key={c.titulo}
                className="rounded-xl border border-brand-border bg-bg-card p-5">
                <div className={`w-9 h-9 rounded-lg ${c.fondo} flex items-center justify-center mb-3`}>
                  <c.icono size={17} className={c.color} />
                </div>
                <h3 className="text-sm font-semibold">{c.titulo}</h3>
                <p className="text-xs text-text-secondary leading-relaxed mt-1.5">{c.texto}</p>
              </article>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-5 max-w-3xl leading-relaxed">
            El gateway es el punto de acceso de los nodos: una red aislada sin salida a
            internet. Lo único que sale es lo que él sube, y lo sube cuando puede. Durante un
            corte de 21 minutos no se perdió ninguna trama.
          </p>
        </section>

        {/* ── Qué se mide y con qué programa ────────────────── */}
        <section className="py-10 border-t border-brand-border grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold mb-4">Lo que se mide</h2>
            <ul className="divide-y divide-brand-border rounded-xl border border-brand-border bg-bg-card">
              {VARIABLES.map((v) => (
                <li key={v.nombre} className="flex items-center gap-3 px-4 py-3">
                  <v.icono size={15} className="text-text-muted shrink-0" />
                  <span className="text-sm flex-1">{v.nombre}</span>
                  <span className="text-[11px] text-text-muted font-mono">{v.como}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
              El pH quedó fuera del alcance experimental: la ruta está implementada pero la
              sonda no se instaló. Se dice aquí para que nadie lo busque en el panel.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-4">El programa del cultivo</h2>
            <ul className="divide-y divide-brand-border rounded-xl border border-brand-border bg-bg-card">
              {PROGRAMA.map((p) => (
                <li key={p.nombre} className="flex items-center gap-3 px-4 py-3">
                  <p.icono size={15} className="text-text-muted shrink-0" />
                  <span className="text-sm flex-1">{p.nombre}</span>
                  <span className="text-sm font-medium tabular-nums">{p.valor}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-muted mt-3 leading-relaxed">
              Vive en la memoria no volátil de cada nodo. Un reinicio no lo borra y el gateway
              lo verifica en cada arranque.
            </p>
          </div>
        </section>

        {/* ── Entrada ───────────────────────────────────────── */}
        <section className="py-12 border-t border-brand-border">
          <div className="rounded-xl border border-brand-blue/30 bg-brand-blue/5 p-6 md:p-8
                          flex flex-wrap items-center justify-between gap-5">
            <div className="max-w-lg">
              <h2 className="text-lg font-bold">El panel</h2>
              <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">
                Lecturas en vivo, la ficha de cada nodo, el mando de los actuadores y el
                análisis del enlace. Requiere cuenta.
              </p>
            </div>
            <Link href="/login"
              className="flex items-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5
                         text-sm font-semibold text-white hover:opacity-90 transition-opacity">
              Iniciar sesión <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-brand-border">
        <p className="mx-auto max-w-5xl px-5 py-6 text-[11px] text-text-muted">
          VitalCrop AGW · Trabajo de grado · Infraestructura IoT y computación en la niebla
          para un cultivo indoor.
        </p>
      </footer>
    </main>
  );
}
