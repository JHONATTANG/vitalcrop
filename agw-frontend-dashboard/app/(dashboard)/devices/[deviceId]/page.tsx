'use client';

/**
 * Ficha de un nodo.
 *
 * Se apoyaba en tres componentes que hablaban un contrato distinto al
 * de la API: pedían la telemetría por el UUID interno cuando el
 * endpoint espera el identificador del nodo, y mandaban órdenes con
 * nombres que el firmware no reconoce. Aquí se resuelve con las mismas
 * agregaciones que usa el resto del panel y con el contrato real.
 *
 * El mando vive en su propia pantalla y no aquí: una orden se encola
 * para un nodo concreto, y tener el mismo botón en dos sitios invita a
 * dispararlo dos veces.
 */
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Cpu, Server, Wifi, Thermometer, Droplets,
  Activity, Clock, CircuitBoard, Terminal, ArrowRight,
} from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import SerieCompuesta from '@/components/charts/SerieCompuesta';
import BalanceDiario from '@/components/charts/BalanceDiario';
import Correlacion from '@/components/charts/Correlacion';
import { useDevice } from '@/hooks/useDevices';
import { useMultiserie, useDiario, useCorrelacion, useEventos } from '@/hooks/useTelecom';

interface Props { params: { deviceId: string } }

const ESTADO = {
  ONLINE:      { texto: 'En línea',       color: 'text-brand-green',  punto: 'bg-brand-green' },
  ERROR:       { texto: 'Con retraso',    color: 'text-brand-yellow', punto: 'bg-brand-yellow' },
  OFFLINE:     { texto: 'Sin respuesta',  color: 'text-brand-red',    punto: 'bg-brand-red' },
  MAINTENANCE: { texto: 'Sin telemetría', color: 'text-text-muted',   punto: 'bg-text-muted' },
} as const;

function antiguedad(s?: number | null): string {
  if (s === null || s === undefined) return 'nunca ha publicado';
  if (s < 90) return `hace ${Math.round(s)} s`;
  if (s < 5400) return `hace ${Math.round(s / 60)} min`;
  if (s < 172800) return `hace ${(s / 3600).toFixed(1)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

function Lectura({ icono: Icono, etiqueta, valor, unidad }: {
  icono: React.ElementType; etiqueta: string;
  valor: React.ReactNode; unidad?: string;
}) {
  return (
    <div className="rounded-lg border border-brand-border bg-bg-secondary p-3">
      <p className="text-[11px] text-text-muted flex items-center gap-1.5">
        <Icono size={12} /> {etiqueta}
      </p>
      <p className="text-lg font-bold text-text-primary tabular-nums mt-1">
        {valor ?? '—'}
        {unidad && valor !== null && valor !== undefined && (
          <span className="text-xs font-medium text-text-secondary ml-1">{unidad}</span>
        )}
      </p>
    </div>
  );
}

function Panel({ titulo, sub, children, verMas }: {
  titulo: string; sub?: string; children: React.ReactNode;
  verMas?: { href: string; texto: string };
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-brand-border">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">{titulo}</h2>
          {sub && <p className="text-[11px] text-text-muted mt-1 max-w-3xl leading-relaxed">{sub}</p>}
        </div>
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
  const { deviceId } = params;
  const { data: aparato, isLoading } = useDevice(deviceId);

  const multi = useMultiserie('temperatura,humedad_ambiente,ec,rssi', 7, 30);
  const diario = useDiario(14);
  const corr = useCorrelacion('temperatura', 'ec', 14);
  const eventos = useEventos(14);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (!aparato) {
    return (
      <PageContainer>
        <Link href="/devices"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary
                     hover:text-text-primary mb-4 transition-colors">
          <ArrowLeft size={15} /> Volver a dispositivos
        </Link>
        <p className="text-text-muted text-sm">
          No se encontró ningún aparato con ese identificador.
        </p>
      </PageContainer>
    );
  }

  const est = ESTADO[aparato.status as keyof typeof ESTADO] ?? ESTADO.MAINTENANCE;
  const esGateway = aparato.device_type === 'GATEWAY';
  const l = aparato.ultima_lectura;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <Link href="/devices"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary
                     hover:text-text-primary transition-colors">
          <ArrowLeft size={15} /> Volver a dispositivos
        </Link>

        {/* ── Cabecera ───────────────────────────────────────── */}
        <div className="rounded-xl border border-brand-border bg-bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                esGateway ? 'bg-brand-blue/15' : 'bg-brand-green/15'}`}>
                {esGateway
                  ? <Server size={19} className="text-brand-blue" />
                  : <Cpu size={19} className="text-brand-green" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-text-primary">{aparato.alias}</h1>
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${est.punto}`} />
                    <span className={`text-xs font-medium ${est.color}`}>{est.texto}</span>
                  </span>
                </div>
                <p className="text-xs text-text-muted font-mono mt-0.5">{aparato.device_uid}</p>
                <p className="text-xs text-text-secondary mt-1">{aparato.description}</p>
                {aparato.location && (
                  <p className="text-[11px] text-text-muted mt-1 flex items-center gap-1">
                    <MapPin size={11} /> {aparato.location}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right text-[11px] text-text-muted space-y-0.5">
              <p>Tipo: <span className="text-text-secondary font-medium">{aparato.device_type}</span></p>
              {aparato.firmware_version && (
                <p className="flex items-center justify-end gap-1">
                  <CircuitBoard size={11} /> firmware{' '}
                  <span className="text-text-secondary">{aparato.firmware_version}</span>
                </p>
              )}
              <p className="flex items-center justify-end gap-1">
                <Clock size={11} /> última señal {antiguedad(aparato.silencio_s)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Última lectura ─────────────────────────────────── */}
        {l && (
          <Panel
            titulo="Última lectura recibida"
            sub={`Del instante en que el gateway la selló, ${antiguedad(aparato.silencio_s)}. La antigüedad del dato es parte del dato.`}
          >
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              <Lectura icono={Thermometer} etiqueta="Temperatura" valor={l.temperatura} unidad="°C" />
              <Lectura icono={Droplets} etiqueta="Humedad del aire" valor={l.humedad} unidad="%" />
              <Lectura icono={Activity} etiqueta="Conductividad" valor={l.ec} unidad="µS/cm" />
              <Lectura icono={Wifi} etiqueta="Señal" valor={l.rssi} unidad="dBm" />
              <Lectura icono={Clock} etiqueta="En marcha"
                valor={l.uptime_ms ? (l.uptime_ms / 3_600_000).toFixed(1) : null} unidad="h" />
            </div>
            {l.agua !== null && l.agua !== undefined && (
              <p className="text-[11px] text-text-muted mt-3">
                Sensor de nivel del sustrato:{' '}
                <span className={l.agua ? 'text-brand-blue' : 'text-text-secondary'}>
                  {l.agua ? 'agua detectada' : 'sin agua libre'}
                </span>
                {' · '}es el que corta el llenado de tierra cuando varía.
              </p>
            )}
          </Panel>
        )}

        {/* ── Series ─────────────────────────────────────────── */}
        <Panel
          titulo="Últimos 7 días"
          sub="Ambiente y calidad del enlace sobre el mismo eje de tiempo. Las franjas oscuras marcan las horas sin luz."
          verMas={{ href: '/telecom', texto: 'Análisis completo' }}
        >
          <SerieCompuesta
            puntos={multi.data?.puntos ?? []}
            metricas={multi.data?.metricas ?? ['temperatura', 'humedad_ambiente', 'ec', 'rssi']}
            fotoperiodo={{ on: 6, off: 18 }}
            alto={330}
          />
        </Panel>

        <Panel
          titulo="Cobertura diaria y trabajo ejecutado"
          sub="Tramas esperadas frente a recibidas, con el riego y la señal media superpuestos."
        >
          <BalanceDiario dias={diario.data?.dias ?? []} alto={310} />
        </Panel>

        {/* ── Correlación y eventos ──────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            titulo="Temperatura frente a conductividad"
            sub="La conductividad de una solución depende de su temperatura. Este cruce dice si la deriva de la EC se explica por ahí o por evaporación real del tanque."
          >
            <Correlacion
              puntos={corr.data?.puntos ?? []}
              x={corr.data?.x ?? 'temperatura'}
              y={corr.data?.y ?? 'ec'}
              r={corr.data?.r}
              alto={300}
            />
          </Panel>

          <Panel
            titulo="Eventos de este nodo"
            sub="Lo que el gateway registró: caídas, reconexiones, riegos y correcciones de programa."
            verMas={{ href: '/alerts', texto: 'Ver todos' }}
          >
            {eventos.data?.eventos?.length ? (
              <ul className="space-y-1 max-h-80 overflow-y-auto text-xs pr-1">
                {eventos.data.eventos
                  .filter((e) => !aparato.sensor_id || e.sensor_id === aparato.sensor_id)
                  .slice(0, 60)
                  .map((e, i) => (
                    <li key={i} className="flex items-baseline gap-2 border-b border-brand-border/30 pb-1">
                      <span className="text-text-muted tabular-nums whitespace-nowrap">
                        {new Date(e.ts).toLocaleString('es', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={
                        e.evento.startsWith('riego') ? 'text-brand-green'
                          : e.evento === 'desconectado' ? 'text-brand-red'
                          : e.evento === 'conectado' ? 'text-brand-blue'
                          : 'text-brand-yellow'
                      }>
                        {e.evento.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-text-muted text-sm py-8 text-center">Sin eventos en 14 días</p>
            )}
          </Panel>
        </div>

        <Link href="/commands"
          className="flex items-center justify-center gap-2 rounded-xl border border-brand-border
                     bg-bg-card px-4 py-3 text-xs text-text-secondary
                     hover:text-text-primary hover:border-brand-blue/40 transition-colors">
          <Terminal size={14} />
          Enviar una orden a este nodo desde el centro de control
          <ArrowRight size={12} />
        </Link>
      </div>
    </PageContainer>
  );
}
