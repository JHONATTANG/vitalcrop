'use client';

/**
 * Inventario de aparatos.
 *
 * Salía vacía porque el hook pedía una ruta que no existía, no porque
 * no hubiera aparatos. Ya corregido, la página muestra el gateway y el
 * nodo con su última lectura y el mapa de la instalación.
 *
 * El estado no viene de una columna: se deduce del silencio. Un nodo no
 * avisa de que se murió, así que la API mide cuánto lleva sin publicar
 * contra tres veces su cadencia. Por eso la tarjeta dice «hace X min»
 * en vez de un simple «en línea»: la antigüedad del dato es parte del
 * dato.
 */
import Link from 'next/link';
import PageContainer from '@/components/layout/PageContainer';
import MapaTopologia from '@/components/topologia/MapaTopologia';
import { useDevices, type Dispositivo } from '@/hooks/useDevices';
import { useGateway } from '@/hooks/useTelecom';
import {
  Cpu, Server, Wifi, Thermometer, Droplets, Activity,
  Clock, CircuitBoard, Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ESTADO = {
  ONLINE:      { texto: 'En línea',        punto: 'bg-brand-green',  color: 'text-brand-green' },
  ERROR:       { texto: 'Con retraso',     punto: 'bg-brand-yellow', color: 'text-brand-yellow' },
  OFFLINE:     { texto: 'Sin respuesta',   punto: 'bg-brand-red',    color: 'text-brand-red' },
  MAINTENANCE: { texto: 'Sin telemetría',  punto: 'bg-text-muted',   color: 'text-text-muted' },
} as const;

function antiguedad(s?: number | null): string {
  if (s === null || s === undefined) return 'nunca ha publicado';
  if (s < 90) return `hace ${Math.round(s)} s`;
  if (s < 5400) return `hace ${Math.round(s / 60)} min`;
  if (s < 172800) return `hace ${(s / 3600).toFixed(1)} h`;
  return `hace ${Math.round(s / 86400)} días`;
}

function Dato({ icono: Icono, etiqueta, valor }: {
  icono: LucideIcon;
  etiqueta: string; valor: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icono size={13} className="text-text-muted shrink-0" />
      <span className="text-[11px] text-text-muted truncate">{etiqueta}</span>
      <span className="text-xs text-text-primary tabular-nums ml-auto shrink-0">{valor}</span>
    </div>
  );
}

function Tarjeta({ d }: { d: Dispositivo }) {
  const est = ESTADO[d.status as keyof typeof ESTADO] ?? ESTADO.MAINTENANCE;
  const esGateway = d.device_type === 'GATEWAY';
  const l = d.ultima_lectura;

  return (
    <article className="rounded-xl border border-brand-border bg-bg-card p-4 h-full
                        transition-colors hover:border-brand-blue/40">
      <header className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          esGateway ? 'bg-brand-blue/15' : 'bg-brand-green/15'}`}>
          {esGateway
            ? <Server size={17} className="text-brand-blue" />
            : <Cpu size={17} className="text-brand-green" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text-primary truncate">{d.alias}</h3>
          <p className="text-[11px] text-text-muted font-mono truncate">{d.device_uid}</p>
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`w-2 h-2 rounded-full ${est.punto}`} />
          <span className={`text-[11px] font-medium ${est.color}`}>{est.texto}</span>
        </span>
      </header>

      <p className="text-[11px] text-text-muted mt-2.5 leading-relaxed">{d.description}</p>

      <div className="mt-3 pt-3 border-t border-brand-border space-y-1.5">
        <Dato icono={Clock} etiqueta="Última señal" valor={antiguedad(d.silencio_s)} />
        {d.firmware_version && (
          <Dato icono={CircuitBoard} etiqueta="Firmware" valor={d.firmware_version} />
        )}
        {l?.rssi !== null && l?.rssi !== undefined && (
          <Dato icono={Wifi} etiqueta="Señal" valor={`${l.rssi} dBm`} />
        )}
        {l?.temperatura !== null && l?.temperatura !== undefined && (
          <Dato icono={Thermometer} etiqueta="Temperatura"
            valor={`${l.temperatura} °C · ${l.humedad ?? '—'} % HR`} />
        )}
        {l?.ec !== null && l?.ec !== undefined && (
          <Dato icono={Activity} etiqueta="Conductividad" valor={`${l.ec} µS/cm`} />
        )}
        {l?.agua !== null && l?.agua !== undefined && (
          <Dato icono={Droplets} etiqueta="Agua en sustrato"
            valor={l.agua ? 'detectada' : 'no detectada'} />
        )}
        {l?.uptime_ms ? (
          <Dato icono={Clock} etiqueta="En marcha"
            valor={`${(l.uptime_ms / 3_600_000).toFixed(1)} h`} />
        ) : null}
      </div>
    </article>
  );
}

export default function DevicesPage() {
  const { data: dispositivos, isLoading } = useDevices();
  const gw = useGateway();

  const total = dispositivos?.length ?? 0;
  const enLinea = dispositivos?.filter((d) => d.status === 'ONLINE').length ?? 0;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Cpu size={20} className="text-brand-green" />
              Dispositivos
            </h1>
            <p className="text-xs text-text-muted mt-1">
              {isLoading
                ? 'Consultando el inventario…'
                : `${total} aparato${total === 1 ? '' : 's'} dado${total === 1 ? '' : 's'} de alta · ${enLinea} en línea`}
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl h-56 skeleton" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3
                          rounded-xl border border-brand-border bg-bg-card">
            <Cpu size={40} className="opacity-30" />
            <p className="text-sm">Todavía no hay ningún aparato dado de alta.</p>
            <p className="text-xs max-w-md text-center">
              El gateway se registra la primera vez que se asocia a esta cuenta;
              los nodos cuelgan de él.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dispositivos!.map((d) => (
              d.device_type === 'GATEWAY'
                ? <Tarjeta key={d.id} d={d} />
                : (
                  <Link key={d.id} href={`/devices/${d.id}`} className="block">
                    <Tarjeta d={d} />
                  </Link>
                )
            ))}
          </div>
        )}

        {/* El mapa repite la información de las tarjetas, pero contesta
            otra pregunta: no «cómo está cada uno» sino «por dónde pasa
            el dato», que es lo que hace falta para localizar un fallo. */}
        <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
          <header className="px-4 py-3 border-b border-brand-border">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Network size={14} className="text-text-muted" />
              Mapa de la instalación
            </h2>
            <p className="text-[11px] text-text-muted mt-1 max-w-3xl leading-relaxed">
              La arquitectura real, con el estado en vivo de cada pieza. Se puede arrastrar
              y acercar; el anillo de cada aparato indica su estado y el grosor de cada
              enlace, su calidad.
            </p>
          </header>
          <div className="p-3">
            <MapaTopologia
              dispositivos={dispositivos ?? []}
              silencioNube={gw.data?.silencio_s ?? null}
              alto={480}
            />
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
