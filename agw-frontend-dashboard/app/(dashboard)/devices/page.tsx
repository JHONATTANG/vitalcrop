'use client';

/**
 * Inventario de aparatos.
 *
 * Tres tarjetas —el gateway y los dos nodos— y debajo el mapa de la
 * instalación. Cada tarjeta lleva lo justo para saber si el aparato
 * está bien y abrir su ficha; el detalle y el mando viven dentro.
 *
 * El estado se deduce del silencio, no de una columna: un nodo no
 * avisa de que se murió, así que la API mide cuánto lleva sin publicar.
 * Por eso cada tarjeta dice «hace X min» y no un simple «en línea».
 */
import { useState } from 'react';
import Link from 'next/link';
import PageContainer from '@/components/layout/PageContainer';
import MapaTopologia from '@/components/topologia/MapaTopologia';
import { useDevices, type Dispositivo } from '@/hooks/useDevices';
import { useGateway } from '@/hooks/useTelecom';
import { antiguedad } from '@/lib/utils';
import {
  Cpu, Server, Wifi, Thermometer, Activity, Clock, Network, ArrowRight,
  FlaskConical, Droplets,
} from 'lucide-react';

const ESTADO = {
  ONLINE:      { texto: 'En línea',       punto: 'bg-brand-green',  color: 'text-brand-green' },
  ERROR:       { texto: 'Con retraso',    punto: 'bg-brand-yellow', color: 'text-brand-yellow' },
  OFFLINE:     { texto: 'Sin respuesta',  punto: 'bg-brand-red',    color: 'text-brand-red' },
  MAINTENANCE: { texto: 'Sin telemetría', punto: 'bg-text-muted',   color: 'text-text-muted' },
} as const;

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-text-muted">{etiqueta}</span>
      <span className="text-text-primary tabular-nums text-right">{valor}</span>
    </div>
  );
}

function TarjetaGateway({ d }: { d: Dispositivo }) {
  const est = ESTADO[d.status as keyof typeof ESTADO] ?? ESTADO.MAINTENANCE;
  return (
    <article className="rounded-xl border border-brand-blue/30 bg-bg-card p-4 h-full">
      <header className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-blue/15 flex items-center justify-center shrink-0">
          <Server size={17} className="text-brand-blue" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold">Nodo central</p>
          <h3 className="text-sm font-semibold text-text-primary truncate">Gateway fog</h3>
          <p className="text-[11px] text-text-muted font-mono truncate">{d.device_uid}</p>
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${est.punto}`} />
          <span className={`text-[11px] font-medium ${est.color}`}>{est.texto}</span>
        </span>
      </header>
      <div className="mt-3 pt-3 border-t border-brand-border space-y-1.5">
        <Fila etiqueta="Última trama" valor={`hace ${antiguedad(d.silencio_s)}`} />
        <Fila etiqueta="Nodos a su cargo" valor={d.nodos ?? '—'} />
        <Fila etiqueta="Función" valor="Broker · reglas · buffer" />
      </div>
    </article>
  );
}

function TarjetaNodo({ d }: { d: Dispositivo }) {
  const est = ESTADO[d.status as keyof typeof ESTADO] ?? ESTADO.MAINTENANCE;
  const l = d.ultima_lectura;
  const cap = d.capacidades;
  const especie = d.especie ? d.especie[0].toUpperCase() + d.especie.slice(1) : d.alias;

  return (
    <Link href={`/devices/${d.id}`} className="block h-full group">
      <article className="rounded-xl border border-brand-border bg-bg-card p-4 h-full
                          transition-colors group-hover:border-brand-green/50">
        <header className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-green/15 flex items-center justify-center shrink-0">
            <Cpu size={17} className="text-brand-green" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-brand-green font-semibold">
              Nodo ESP32 {d.simulado && <span className="text-text-muted normal-case tracking-normal">· simulado</span>}
            </p>
            <h3 className="text-sm font-semibold text-text-primary truncate">{especie}</h3>
            <p className="text-[11px] text-text-muted font-mono truncate">{d.device_uid}</p>
          </div>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${est.punto}`} />
            <span className={`text-[11px] font-medium ${est.color}`}>{est.texto}</span>
          </span>
        </header>

        <div className="mt-3 pt-3 border-t border-brand-border space-y-1.5">
          <Fila etiqueta="Última trama" valor={`hace ${antiguedad(d.silencio_s)}`} />
          {l?.rssi != null && <Fila etiqueta="Señal" valor={`${l.rssi} dBm`} />}
          {l?.temperatura != null && (
            <Fila etiqueta="Ambiente" valor={`${l.temperatura} °C · ${l.humedad ?? '—'} %`} />
          )}
          {l?.ec != null && cap?.sensores.includes('tds') && (
            <Fila etiqueta="Conductividad" valor={`${l.ec} µS/cm`} />
          )}
        </div>

        {cap && (
          <div className="mt-3 pt-3 border-t border-brand-border flex flex-wrap gap-1.5">
            {cap.sensores.includes('hdc1080') && <Chip icono={Thermometer} texto="Aire" />}
            {cap.sensores.includes('tds') && <Chip icono={FlaskConical} texto="EC" />}
            {cap.sensores.includes('nivel') && <Chip icono={Droplets} texto="Nivel" />}
            {cap.actuadores.includes('valvula_hidro') && <Chip icono={Activity} texto="Hidro" tono="ambar" />}
            {cap.actuadores.includes('valvula_tierra') && <Chip icono={Activity} texto="Tierra" tono="ambar" />}
            {cap.actuadores.includes('luz') && <Chip icono={Activity} texto="Luz" tono="ambar" />}
          </div>
        )}

        <p className="mt-3 text-[11px] text-brand-blue flex items-center gap-1 opacity-0
                      group-hover:opacity-100 transition-opacity">
          Abrir ficha y mando <ArrowRight size={11} />
        </p>
      </article>
    </Link>
  );
}

function Chip({ icono: Icono, texto, tono = 'cian' }: {
  icono: React.ElementType; texto: string; tono?: 'cian' | 'ambar';
}) {
  const c = tono === 'ambar'
    ? 'border-brand-yellow/30 text-brand-yellow bg-brand-yellow/10'
    : 'border-cyan-400/30 text-cyan-300 bg-cyan-400/10';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${c}`}>
      <Icono size={10} /> {texto}
    </span>
  );
}

export default function DevicesPage() {
  const { data: dispositivos, isLoading } = useDevices();
  const gw = useGateway();
  const [foco, setFoco] = useState<string | 'todos'>('todos');

  const gateway = dispositivos?.find((d) => d.device_type === 'GATEWAY');
  const nodos = dispositivos?.filter((d) => d.device_type !== 'GATEWAY') ?? [];
  const enLinea = dispositivos?.filter((d) => d.status === 'ONLINE').length ?? 0;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Cpu size={20} className="text-brand-green" /> Dispositivos
            </h1>
            <p className="text-xs text-text-muted mt-1">
              {isLoading ? 'Consultando…'
                : `${(dispositivos?.length ?? 0)} aparatos · ${enLinea} en línea`}
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="rounded-xl h-52 skeleton" />)}
          </div>
        ) : !dispositivos?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3
                          rounded-xl border border-brand-border bg-bg-card">
            <Cpu size={40} className="opacity-30" />
            <p className="text-sm">Todavía no hay ningún aparato dado de alta.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {gateway && <TarjetaGateway d={gateway} />}
            {nodos.map((d) => <TarjetaNodo key={d.id} d={d} />)}
          </div>
        )}

        <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
          <header className="px-4 py-3 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Network size={14} className="text-text-muted" /> Mapa de la instalación
            </h2>
            {nodos.length > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-0.5">
                {[{ id: 'todos', nombre: 'Todos' }, ...nodos.map((n) => ({
                  id: n.device_uid,
                  nombre: n.especie ? n.especie[0].toUpperCase() + n.especie.slice(1) : n.device_uid,
                }))].map((o) => (
                  <button key={o.id} onClick={() => setFoco(o.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      foco === o.id ? 'bg-brand-blue/20 text-brand-blue' : 'text-text-muted hover:text-text-primary'}`}>
                    {o.nombre}
                  </button>
                ))}
              </div>
            )}
          </header>
          <div className="p-2">
            <MapaTopologia
              dispositivos={dispositivos ?? []}
              silencioNube={gw.data?.silencio_s ?? null}
              soloNodo={foco === 'todos' ? undefined : foco}
              alto={520}
            />
          </div>
          <p className="px-4 pb-3 text-[11px] text-text-muted">
            Arrastra para recomponer · rueda para acercar · el grosor del enlace es la señal real
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
