'use client';

/**
 * Fog computing — la autonomía del borde, medida.
 *
 * El proyecto declara la "resiliencia de borde distribuida" como su
 * aporte innovador. Hasta ahora eso se sostenía con un diagrama de
 * arquitectura; esta página lo sostiene con cuentas.
 *
 * El argumento tiene una forma verificable: durante casi toda la
 * ventana de datos la nube estuvo apagada, y el cultivo se regó, se
 * iluminó y se corrigió solo. Cada decisión dejó un evento, y los
 * eventos se cuentan.
 *
 * NOTA DE ARQUITECTURA: la nube no puede consultar a la Raspberry. Está
 * detrás del NAT del router y su red de cultivo no tiene salida. Todo
 * lo que se ve aquí está inferido del flujo de datos que el gateway
 * produce — que es, además, la única señal que un operador remoto real
 * tendría de él.
 */
import React, { useState } from 'react';
import {
  Server, ShieldCheck, Droplets, PlugZap, Clock, GitBranch,
  CloudOff, Radio, Network, TrendingUp, Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import { useGateway, useFog, useDiario, useMultiserie } from '@/hooks/useTelecom';
import { useDevices } from '@/hooks/useDevices';

import AutonomiaAcumulada from '@/components/fog/AutonomiaAcumulada';
import Recuperaciones from '@/components/fog/Recuperaciones';
import HuecosDeDatos from '@/components/fog/HuecosDeDatos';
import DecisionesBorde from '@/components/fog/DecisionesBorde';
import SerieCompuesta from '@/components/charts/SerieCompuesta';
import BalanceDiario from '@/components/charts/BalanceDiario';
import MapaTopologia from '@/components/topologia/MapaTopologia';

const VENTANAS = [7, 30, 90];

function Tarjeta({ icono: Icono, titulo, valor, unidad, pie, tono = 'blue' }: {
  icono: LucideIcon;
  titulo: string; valor: React.ReactNode; unidad?: string;
  pie?: string; tono?: 'blue' | 'green' | 'yellow' | 'red' | 'violeta';
}) {
  const color = {
    blue: 'text-brand-blue', green: 'text-brand-green',
    yellow: 'text-brand-yellow', red: 'text-brand-red',
    violeta: 'text-[#A78BFA]',
  }[tono];

  return (
    <div className="rounded-xl border border-brand-border bg-bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-text-muted flex items-center gap-1.5">
        <Icono size={12} /> {titulo}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-1.5 ${color}`}>
        {valor}
        {unidad && <span className="text-sm font-medium text-text-secondary ml-1">{unidad}</span>}
      </p>
      {pie && <p className="text-[11px] text-text-muted mt-1 leading-snug">{pie}</p>}
    </div>
  );
}

function Panel({ titulo, sub, children, icono: Icono, accion }: {
  titulo: string; sub?: string; children: React.ReactNode;
  icono?: LucideIcon;
  accion?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-brand-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            {Icono && <Icono size={14} className="text-text-muted shrink-0" />}
            {titulo}
          </h2>
          {sub && <p className="text-[11px] text-text-muted mt-1 max-w-3xl leading-relaxed">{sub}</p>}
        </div>
        {accion}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

const seg = (s: number | null) =>
  s === null ? '—' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;

export default function FogPage() {
  const [dias, setDias] = useState(30);

  const fog = useFog(dias);
  const gw = useGateway();
  const diario = useDiario(Math.min(dias, 60));
  const multi = useMultiserie('temperatura,humedad_ambiente,ec,rssi', Math.min(dias, 14), 60);
  const dispositivos = useDevices();

  const d = fog.data;
  const enLinea = gw.data?.estado === 'en linea';
  const mttrCumple = (d?.recuperaciones?.mttr_s ?? Infinity) <= (d?.recuperaciones?.objetivo_s ?? 90);

  // Instante en que arrancó la subida en vivo, para marcarlo en la
  // curva acumulada: es la frontera entre "el borde guardaba" y "el
  // borde guarda y además transmite".
  const desdeNube = gw.data?.por_origen?.find((o) => o.origen === 'directo')?.desde ?? null;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Server size={20} className="text-brand-green" />
              Nodo fog
            </h1>
            <p className="text-xs text-text-muted mt-1">
              FOG_RPI_HIERBABUENA_01 · resiliencia de borde, medida sobre datos reales
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
            {VENTANAS.map((v) => (
              <button key={v} onClick={() => setDias(v)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  dias === v ? 'bg-brand-green/20 text-brand-green font-medium'
                             : 'text-text-secondary hover:text-text-primary'}`}>
                {v} días
              </button>
            ))}
          </div>
        </header>

        {/* ── Estado actual ──────────────────────────────────── */}
        <div className="rounded-xl border border-brand-border bg-bg-card px-4 py-3
                        flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${enLinea ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
            <span className={enLinea ? 'text-brand-green font-medium' : 'text-brand-yellow font-medium'}>
              {enLinea ? 'en línea' : gw.data?.estado ?? '—'}
            </span>
          </span>
          <span className="text-text-muted">
            última trama hace{' '}
            <span className="tabular-nums text-text-secondary">
              {gw.data ? Math.round(gw.data.silencio_s / 60) : '—'} min
            </span>
          </span>
          <span className="text-text-muted flex items-center gap-1.5">
            <CloudOff size={13} />
            tramas subidas en vivo:{' '}
            <span className="tabular-nums text-text-secondary">
              {(gw.data?.ingesta_en_vivo ?? 0).toLocaleString()}
            </span>
          </span>
        </div>

        {/* ── La tesis, en cuatro números ────────────────────── */}
        <Panel
          icono={ShieldCheck}
          titulo="La nube estuvo apagada casi todo este tiempo"
          sub="Y el cultivo funcionó. Esto es lo que el proyecto llama resiliencia de borde: no que el sistema tolere la caída de la nube, sino que nunca la haya necesitado para operar."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tarjeta
              icono={CloudOff} tono="green"
              titulo="Operando sin nube"
              valor={d?.autonomia?.dias_sin_nube ?? '—'} unidad="días"
              pie={`${d?.autonomia?.pct_del_historico_sin_nube ?? 0} % del histórico se generó sin conexión`}
            />
            <Tarjeta
              icono={Droplets} tono="blue"
              titulo="Riego ejecutado solo"
              valor={d?.riego_autonomo?.ciclos ?? '—'} unidad="ciclos"
              pie={`${d?.riego_autonomo?.minutos_bomba ?? 0} min de bomba decididos por el nodo y el gateway`}
            />
            <Tarjeta
              icono={PlugZap} tono={mttrCumple ? 'green' : 'yellow'}
              titulo="Tiempo medio de recuperación"
              valor={seg(d?.recuperaciones?.mttr_s ?? null)}
              pie={`objetivo §9: menos de 90 s · peor caso ${seg(d?.recuperaciones?.peor_s ?? null)} · ${d?.recuperaciones?.n ?? 0} recuperaciones`}
            />
            <Tarjeta
              icono={ShieldCheck} tono="violeta"
              titulo="Retenido en el borde"
              valor={(d?.autonomia?.tramas_generadas_sin_nube ?? 0).toLocaleString()}
              unidad="tramas"
              pie="guardadas en SQLite mientras no había ruta a la nube, y subidas después sin perder ninguna"
            />
          </div>
        </Panel>

        {/* ── Curva de autonomía ─────────────────────────────── */}
        <Panel
          icono={TrendingUp}
          titulo="Lo que el borde fue acumulando, día a día"
          sub="El área bajo la curva es literalmente el dato que no se perdió. La cifra de arriba es su valor final; aquí se ve que no llegó de golpe, sino a ritmo constante durante semanas mientras nadie miraba."
        >
          <AutonomiaAcumulada dias={diario.data?.dias ?? []} desdeNube={desdeNube} />
        </Panel>

        {/* ── Balance diario ─────────────────────────────────── */}
        <Panel
          icono={Activity}
          titulo="Qué pasó cada día: cobertura, señal y trabajo"
          sub="Cruzar las tres cosas sobre el mismo día es lo que deja ver las coincidencias: si las tramas perdidas se concentran en los días con reinicios, o si un día con mucha bomba degrada el enlace."
        >
          <BalanceDiario dias={diario.data?.dias ?? []} />
        </Panel>

        {/* ── Decisiones y recuperaciones ────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            icono={GitBranch}
            titulo="Decisiones tomadas en el borde"
            sub="Cada barra es una acción que el sistema resolvió sin consultar a nadie."
          >
            <DecisionesBorde decisiones={d?.decisiones_del_borde ?? []} />
          </Panel>

          <Panel
            icono={PlugZap}
            titulo="Recuperaciones tras caída del nodo"
            sub="De «desconectado» al siguiente «conectado». Es el tiempo de recuperación real del §9, no una estimación. La media esconde si son incidentes parecidos o uno malo que arrastra al resto."
          >
            <Recuperaciones
              detalle={d?.recuperaciones?.detalle ?? []}
              objetivoS={d?.recuperaciones?.objetivo_s ?? 90}
            />
          </Panel>
        </div>

        {/* ── Huecos ─────────────────────────────────────────── */}
        <Panel
          icono={Clock}
          titulo="Huecos en la serie de datos"
          sub="Periodos sin una sola trama, situados en el calendario. Varios huecos el mismo día apuntan a una causa común; repartidos, a un problema de fondo del enlace. Un hueco con riego ocurriendo dentro es la prueba directa de que el nodo no necesita al gateway para seguir su programa."
        >
          <HuecosDeDatos huecos={d?.huecos_de_datos ?? []} />
        </Panel>

        {/* ── Serie compuesta ────────────────────────────────── */}
        <Panel
          icono={TrendingUp}
          titulo="Lo que el borde midió mientras decidía"
          sub="Las variables del cultivo y la calidad del enlace sobre el mismo eje. Las franjas oscuras son las horas sin luz."
        >
          <SerieCompuesta
            puntos={multi.data?.puntos ?? []}
            metricas={multi.data?.metricas ?? ['temperatura', 'humedad_ambiente', 'ec', 'rssi']}
            fotoperiodo={{ on: 6, off: 18 }}
            alto={330}
          />
        </Panel>

        {/* ── Topología ──────────────────────────────────────── */}
        <Panel
          icono={Network}
          titulo="Quién habla con quién, ahora mismo"
          sub="La arquitectura con los aparatos reales dados de alta y su estado en vivo. Arrastra cualquiera para recomponer el mapa; el grosor de cada enlace codifica su calidad."
        >
          <MapaTopologia
            dispositivos={dispositivos.data ?? []}
            silencioNube={gw.data?.silencio_s ?? null}
            alto={470}
          />
        </Panel>

        {/* ── Qué decide cada capa ───────────────────────────── */}
        <Panel
          icono={GitBranch}
          titulo="Dónde vive cada decisión"
          sub="El reparto no es una preferencia de diseño: es lo que determina si el cultivo sobrevive a una caída de red."
        >
          <div className="grid gap-3 md:grid-cols-3 text-xs">
            {[
              {
                icono: Radio, tono: 'text-brand-green', capa: 'Nodo ESP32',
                lat: '1 s o menos',
                items: ['Cortar el llenado al detectar agua', 'Ciclos de riego de día y de noche',
                        'Fotoperiodo y corte por sobretemperatura', 'Enclavamientos de seguridad'],
                nota: 'Ejecuta desde su memoria no volátil aunque el gateway desaparezca para siempre.',
              },
              {
                icono: Server, tono: 'text-brand-blue', capa: 'Nodo fog',
                lat: '60 s o menos',
                items: ['Detectar la caída y reponer la hora', 'Verificar y corregir el programa',
                        'Motor de reglas y alertas', 'Archivo local en SQLite'],
                nota: 'Decide sin consultar a la nube y archiva antes de transmitir.',
              },
              {
                icono: GitBranch, tono: 'text-text-muted', capa: 'Nube',
                lat: 'no aplica',
                items: ['Histórico de largo plazo', 'Consulta remota y paneles',
                        'Cola de órdenes', 'Análisis de telecomunicaciones'],
                nota: 'Ninguna decisión que mantenga vivo el cultivo depende de ella.',
              },
            ].map((c) => (
              <div key={c.capa} className="rounded-lg border border-brand-border bg-bg-secondary p-3">
                <p className={`font-semibold flex items-center gap-1.5 ${c.tono}`}>
                  <c.icono size={14} /> {c.capa}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                  <Clock size={10} /> latencia de decisión: {c.lat}
                </p>
                <ul className="mt-2 space-y-1 text-text-secondary">
                  {c.items.map((i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-text-muted">·</span>{i}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-text-muted italic mt-2 leading-snug">{c.nota}</p>
              </div>
            ))}
          </div>
        </Panel>

        {d?.ventana && (
          <p className="text-[11px] text-text-muted text-center pt-2 pb-4 tabular-nums">
            ventana analizada: {new Date(d.ventana.desde).toLocaleDateString('es')} →{' '}
            {new Date(d.ventana.hasta).toLocaleDateString('es')} ·{' '}
            {d.ventana.sin_nube.toLocaleString()} tramas generadas sin nube ·{' '}
            {d.ventana.con_nube.toLocaleString()} con nube
          </p>
        )}
      </div>
    </PageContainer>
  );
}
