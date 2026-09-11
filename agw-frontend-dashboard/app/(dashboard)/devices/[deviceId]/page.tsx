'use client';

/**
 * Ficha de un aparato.
 *
 * Para un nodo: lo que lee, lo que se le puede mandar y lo que ha
 * hecho, con las gráficas acotadas a ESE nodo. Antes pedía las series
 * sin filtrar y la ficha de lechuga enseñaba las curvas de hierbabuena.
 *
 * El mando vive aquí además de en el centro de control. Se decidió lo
 * contrario en su día —«tener el mismo botón en dos sitios invita a
 * dispararlo dos veces»— pero el uso demostró lo inverso: quien mira
 * la ficha de un nodo y ve algo raro quiere actuar ahí, no ir a otra
 * pantalla y volver a elegir el destinatario. El destinatario aquí
 * está fijado por la propia ficha, así que ese riesgo no existe.
 *
 * Para el gateway: su estado y el mapa de lo que cuelga de él. No
 * tiene mando: lo que se le cambia se cambia por SSH.
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft, Cpu, Server, Wifi, Thermometer, Droplets, Activity, Clock,
  CircuitBoard, Terminal, ArrowRight, Network, LineChart, ListChecks,
} from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import SerieCompuesta from '@/components/charts/SerieCompuesta';
import BalanceDiario from '@/components/charts/BalanceDiario';
import Correlacion from '@/components/charts/Correlacion';
import MapaTopologia from '@/components/topologia/MapaTopologia';
import MandoNodo from '@/components/devices/MandoNodo';
import { useDevice, useDevices } from '@/hooks/useDevices';
import { useMultiserie, useDiario, useCorrelacion, useEventos, useGateway } from '@/hooks/useTelecom';
import { antiguedad } from '@/lib/utils';

interface Props { params: { deviceId: string } }

const ESTADO = {
  ONLINE:      { texto: 'En línea',       color: 'text-brand-green',  punto: 'bg-brand-green' },
  ERROR:       { texto: 'Con retraso',    color: 'text-brand-yellow', punto: 'bg-brand-yellow' },
  OFFLINE:     { texto: 'Sin respuesta',  color: 'text-brand-red',    punto: 'bg-brand-red' },
  MAINTENANCE: { texto: 'Sin telemetría', color: 'text-text-muted',   punto: 'bg-text-muted' },
} as const;

type Pestana = 'lecturas' | 'mando' | 'historial';

function Lectura({ icono: Icono, etiqueta, valor, unidad }: {
  icono: React.ElementType; etiqueta: string; valor: React.ReactNode; unidad?: string;
}) {
  return (
    <div className="rounded-lg border border-brand-border bg-bg-secondary p-3">
      <p className="text-[11px] text-text-muted flex items-center gap-1.5"><Icono size={12} /> {etiqueta}</p>
      <p className="text-lg font-bold text-text-primary tabular-nums mt-1">
        {valor ?? '—'}
        {unidad && valor != null && <span className="text-xs font-medium text-text-secondary ml-1">{unidad}</span>}
      </p>
    </div>
  );
}

function Panel({ titulo, children, verMas }: {
  titulo: string; children: React.ReactNode; verMas?: { href: string; texto: string };
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-brand-border">
        <h2 className="text-sm font-semibold text-text-primary">{titulo}</h2>
        {verMas && (
          <Link href={verMas.href}
            className="text-[11px] text-brand-blue hover:underline flex items-center gap-1 shrink-0">
            {verMas.texto} <ArrowRight size={11} />
          </Link>
        )}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function DeviceDetailPage({ params }: Props) {
  const { data: aparato, isLoading, isError } = useDevice(params.deviceId);
  const { data: todos } = useDevices();
  const gw = useGateway();
  const [pestana, setPestana] = useState<Pestana>('lecturas');

  // Todas acotadas al nodo. Sin `sensor_id` la API responde con el
  // agregado y la ficha de un nodo enseñaría la de otro.
  const sid = aparato?.sensor_id;
  const cap = aparato?.capacidades;
  const metricas = ['temperatura', 'humedad_ambiente',
    ...(cap?.sensores.includes('tds') ? ['ec'] : []), 'rssi'].join(',');
  const multi = useMultiserie(metricas, 7, 30, sid);
  const diario = useDiario(14, sid);
  const corr = useCorrelacion('temperatura', cap?.sensores.includes('tds') ? 'ec' : 'humedad_ambiente', 14, 1200, sid);
  const eventos = useEventos(14, undefined, sid);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-40 rounded-xl" /></div>
      </PageContainer>
    );
  }

  if (!aparato) {
    return (
      <PageContainer>
        <Link href="/devices" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4">
          <ArrowLeft size={15} /> Dispositivos
        </Link>
        <p className="text-text-muted text-sm">
          {isError
            ? 'La API no responde. El nodo sigue ahí; se reintenta solo.'
            : 'No hay ningún aparato con ese identificador.'}
        </p>
      </PageContainer>
    );
  }

  const est = ESTADO[aparato.status as keyof typeof ESTADO] ?? ESTADO.MAINTENANCE;
  const esGateway = aparato.device_type === 'GATEWAY';
  const l = aparato.ultima_lectura;
  const nombre = esGateway ? 'Gateway fog'
    : aparato.especie ? aparato.especie[0].toUpperCase() + aparato.especie.slice(1) : aparato.alias;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <Link href="/devices" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft size={15} /> Dispositivos
        </Link>

        {/* ── Cabecera ───────────────────────────────────────── */}
        <div className="rounded-xl border border-brand-border bg-bg-card px-5 py-4
                        flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              esGateway ? 'bg-brand-blue/15' : 'bg-brand-green/15'}`}>
              {esGateway ? <Server size={19} className="text-brand-blue" /> : <Cpu size={19} className="text-brand-green" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-text-primary">{nombre}</h1>
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${est.punto}`} />
                  <span className={`text-xs font-medium ${est.color}`}>{est.texto}</span>
                </span>
                {aparato.simulado && (
                  <span className="text-[10px] uppercase tracking-wider text-text-muted border border-brand-border rounded px-1.5 py-0.5">simulado</span>
                )}
              </div>
              <p className="text-xs text-text-muted font-mono mt-0.5">{aparato.device_uid}</p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-text-muted">
            <div className="flex items-center gap-1"><Clock size={11} /> hace {antiguedad(aparato.silencio_s)}</div>
            {aparato.firmware_version && <div className="flex items-center gap-1"><CircuitBoard size={11} /> fw {aparato.firmware_version}</div>}
            {l?.rssi != null && <div className="flex items-center gap-1"><Wifi size={11} /> {l.rssi} dBm</div>}
            {l?.uptime_ms ? <div>{(l.uptime_ms / 3_600_000).toFixed(1)} h en marcha</div> : null}
          </dl>
        </div>

        {/* ── Gateway: solo estado y mapa ────────────────────── */}
        {esGateway ? (
          <Panel titulo="Lo que cuelga de él" verMas={{ href: '/fog', texto: 'Nodo fog' }}>
            <MapaTopologia dispositivos={todos ?? []} silencioNube={gw.data?.silencio_s ?? null} alto={480} />
          </Panel>
        ) : (
          <>
            {/* ── Pestañas ───────────────────────────────────── */}
            <div className="flex gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1 w-fit">
              {([
                ['lecturas', LineChart, 'Lecturas'],
                ['mando', Terminal, 'Mando'],
                ['historial', ListChecks, 'Historial'],
              ] as const).map(([id, Icono, texto]) => (
                <button key={id} onClick={() => setPestana(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    pestana === id ? 'bg-brand-blue/20 text-brand-blue' : 'text-text-muted hover:text-text-primary'}`}>
                  <Icono size={13} /> {texto}
                </button>
              ))}
            </div>

            {pestana === 'lecturas' && (
              <>
                {l && (
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    <Lectura icono={Thermometer} etiqueta="Temperatura" valor={l.temperatura} unidad="°C" />
                    <Lectura icono={Droplets} etiqueta="Humedad del aire" valor={l.humedad} unidad="%" />
                    {cap?.sensores.includes('tds') && <Lectura icono={Activity} etiqueta="Conductividad" valor={l.ec} unidad="µS/cm" />}
                    {cap?.sensores.includes('nivel') && (
                      <Lectura icono={Droplets} etiqueta="Sustrato" valor={l.agua == null ? null : l.agua ? 'con agua' : 'seco'} />
                    )}
                    <Lectura icono={Wifi} etiqueta="Señal" valor={l.rssi} unidad="dBm" />
                  </div>
                )}
                <Panel titulo="Últimos 7 días" verMas={{ href: '/telecom', texto: 'Análisis del enlace' }}>
                  <SerieCompuesta puntos={multi.data?.puntos ?? []}
                    metricas={multi.data?.metricas ?? metricas.split(',')}
                    fotoperiodo={{ on: 6, off: 18 }} alto={320} />
                </Panel>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Panel titulo="Cobertura diaria y riegos">
                    <BalanceDiario dias={diario.data?.dias ?? []} alto={300} />
                  </Panel>
                  <Panel titulo={cap?.sensores.includes('tds') ? 'Temperatura frente a conductividad' : 'Temperatura frente a humedad'}>
                    <Correlacion puntos={corr.data?.puntos ?? []} x={corr.data?.x ?? 'temperatura'}
                      y={corr.data?.y ?? 'ec'} r={corr.data?.r} alto={300} />
                  </Panel>
                </div>
              </>
            )}

            {pestana === 'mando' && (
              <Panel titulo="Mando" verMas={{ href: '/commands', texto: 'Centro de control' }}>
                <MandoNodo nodo={aparato} />
              </Panel>
            )}

            {pestana === 'historial' && (
              <Panel titulo="Lo que el gateway registró de este nodo" verMas={{ href: '/alerts', texto: 'Alertas' }}>
                {eventos.data?.eventos?.length ? (
                  <ul className="divide-y divide-brand-border/40 text-xs max-h-[480px] overflow-y-auto pr-1">
                    {eventos.data.eventos.slice(0, 120).map((e, i) => (
                      <li key={i} className="flex items-baseline gap-3 py-1.5">
                        <span className="text-text-muted tabular-nums whitespace-nowrap w-24">
                          {new Date(e.ts).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={
                          e.evento.startsWith('riego') ? 'text-brand-green'
                            : e.evento === 'desconectado' ? 'text-brand-red'
                            : e.evento === 'conectado' ? 'text-brand-blue' : 'text-brand-yellow'}>
                          {e.evento.replace(/_/g, ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-text-muted text-sm py-8 text-center">Sin eventos en 14 días</p>}
              </Panel>
            )}
          </>
        )}

        {!esGateway && (
          <Panel titulo="Su sitio en la instalación">
            <MapaTopologia dispositivos={todos ?? []} silencioNube={gw.data?.silencio_s ?? null}
              soloNodo={aparato.device_uid} alto={400} />
          </Panel>
        )}
      </div>
    </PageContainer>
  );
}
