'use client';

/**
 * Centro de control.
 *
 * Un selector de nodo, el mando de ese nodo y el historial de todas
 * las órdenes. El catálogo y los botones viven en `lib/ordenes` y
 * `MandoNodo`, compartidos con la ficha de cada nodo, para que los dos
 * sitios ofrezcan exactamente lo mismo.
 *
 * EL MANDO ES ASÍNCRONO, Y ESO SE VE
 *
 * La nube no alcanza al ESP32: vive en la red aislada del cultivo,
 * detrás del gateway. Pulsar un botón encola una fila; el gateway la
 * recoge en su siguiente vuelta y la entrega por MQTT. La interfaz no
 * lo disimula: la orden aparece «en cola» y pasa a «entregada» cuando
 * el gateway acusa recibo.
 */
import { useState } from 'react';
import Link from 'next/link';
import {
  Terminal, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, Waves, Cpu, ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import MandoNodo from '@/components/devices/MandoNodo';
import { useCommands, describirComando } from '@/hooks/useCommands';
import { useNodos } from '@/hooks/useDevices';
import type { EstadoComando } from '@/types/command';

const ICONO_ESTADO: Record<EstadoComando, LucideIcon> = {
  pendiente: Clock, entregado: CheckCircle2, fallido: XCircle, cancelado: AlertCircle,
};
const TEXTO_ESTADO: Record<EstadoComando, string> = {
  pendiente: 'En cola', entregado: 'Entregada', fallido: 'Fallida', cancelado: 'Cancelada',
};
const COLOR_ESTADO: Record<EstadoComando, string> = {
  pendiente: 'text-brand-yellow', entregado: 'text-brand-green',
  fallido: 'text-brand-red', cancelado: 'text-text-muted',
};

export default function CommandsPage() {
  const { data: nodos = [] } = useNodos();
  const historial = useCommands(60);
  const [destino, setDestino] = useState<string | null>(null);
  const [filtroHist, setFiltroHist] = useState<'todos' | string>('todos');

  const nodo = nodos.find((n) => n.device_uid === destino) ?? nodos[0];
  const pendientes = historial.data?.filter((c) => c.estado === 'pendiente').length ?? 0;
  const filas = (historial.data ?? []).filter(
    (c) => filtroHist === 'todos' || c.sensor_id === filtroHist,
  );

  const nombreDe = (uid?: string) => {
    const n = nodos.find((x) => x.device_uid === uid);
    return n?.especie ? n.especie[0].toUpperCase() + n.especie.slice(1) : uid ?? '—';
  };

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Terminal size={20} className="text-brand-blue" /> Centro de control
            </h1>
            <p className="text-xs text-text-muted mt-1">
              Las órdenes se encolan y el gateway las entrega en segundos.
              {pendientes > 0 && (
                <span className="text-brand-yellow ml-2">· {pendientes} sin entregar</span>
              )}
            </p>
          </div>
        </header>

        {/* ── Selector de nodo ───────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-text-muted mr-1">Nodo</span>
          {nodos.map((n) => {
            const activo = n.device_uid === nodo?.device_uid;
            return (
              <button key={n.device_uid} onClick={() => setDestino(n.device_uid)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  activo ? 'border-brand-green/50 bg-brand-green/10 text-text-primary'
                         : 'border-brand-border bg-bg-card text-text-secondary hover:text-text-primary'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${n.status === 'ONLINE' ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
                <Cpu size={12} className={activo ? 'text-brand-green' : 'text-text-muted'} />
                {nombreDe(n.device_uid)}
                <span className="font-mono text-[10px] text-text-muted">{n.device_uid}</span>
              </button>
            );
          })}
          {nodo && (
            <Link href={`/devices/${nodo.id}`}
              className="ml-auto text-[11px] text-brand-blue hover:underline flex items-center gap-1">
              Ficha del nodo <ArrowRight size={11} />
            </Link>
          )}
        </div>

        {/* ── Mando ──────────────────────────────────────────── */}
        {nodo ? (
          <section className="rounded-xl border border-brand-border bg-bg-card p-4">
            <MandoNodo nodo={nodo} />
          </section>
        ) : (
          <div className="rounded-xl border border-brand-border bg-bg-card py-12 text-center text-text-muted text-sm">
            No hay ningún nodo dado de alta.
          </div>
        )}

        {/* ── Historial ──────────────────────────────────────── */}
        <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-brand-border">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Waves size={14} className="text-text-muted" /> Historial
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-brand-border bg-bg-secondary p-0.5">
                {[{ id: 'todos', nombre: 'Todos' }, ...nodos.map((n) => ({ id: n.device_uid, nombre: nombreDe(n.device_uid) }))]
                  .map((o) => (
                    <button key={o.id} onClick={() => setFiltroHist(o.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        filtroHist === o.id ? 'bg-brand-blue/20 text-brand-blue' : 'text-text-muted hover:text-text-primary'}`}>
                      {o.nombre}
                    </button>
                  ))}
              </div>
              <button onClick={() => historial.refetch()} title="Actualizar"
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
                <RefreshCw size={14} className={historial.isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </header>

          <div className="p-3">
            {historial.isLoading ? (
              <p className="text-text-muted text-sm py-8 text-center">Cargando…</p>
            ) : !filas.length ? (
              <p className="text-text-muted text-sm py-10 text-center">Sin órdenes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[36rem]">
                  <thead>
                    <tr className="text-text-muted border-b border-brand-border">
                      <th className="text-left font-medium py-2">Orden</th>
                      <th className="text-left font-medium">Nodo</th>
                      <th className="text-left font-medium">Pedida</th>
                      <th className="text-left font-medium">Entregada</th>
                      <th className="text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((c) => {
                      const est = (c.estado ?? 'pendiente') as EstadoComando;
                      const Icono = ICONO_ESTADO[est];
                      const demora = c.entregado_en && c.creado_en
                        ? (new Date(c.entregado_en).getTime() - new Date(c.creado_en).getTime()) / 1000 : null;
                      return (
                        <tr key={c.id} className="border-b border-brand-border/40">
                          <td className="py-2">
                            <span className="text-text-primary">{describirComando(c.comando)}</span>
                            <span className="block text-[10px] text-text-muted font-mono">{JSON.stringify(c.comando)}</span>
                          </td>
                          <td className="text-text-secondary">
                            {nombreDe(c.sensor_id)}
                            {c.aviso && (
                              <span className={`block text-[10px] ${c.aviso === 'entregado' ? 'text-brand-green' : 'text-text-muted'}`}>
                                {c.aviso === 'entregado' ? 'aviso al instante' : c.aviso === 'fallido' ? 'aviso fallido · sondeo' : 'sin webhook · sondeo'}
                              </span>
                            )}
                          </td>
                          <td className="text-text-muted tabular-nums whitespace-nowrap">
                            {c.creado_en && new Date(c.creado_en).toLocaleString('es', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="text-text-muted tabular-nums whitespace-nowrap">
                            {c.entregado_en ? <>
                              {new Date(c.entregado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              {demora !== null && <span className="text-text-muted/70"> · {demora.toFixed(1)} s</span>}
                            </> : '—'}
                          </td>
                          <td className={`text-right whitespace-nowrap ${COLOR_ESTADO[est]}`}>
                            <span className="inline-flex items-center gap-1.5">
                              <Icono size={12} className={est === 'pendiente' ? 'animate-pulse' : ''} />
                              {TEXTO_ESTADO[est]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
