'use client';

/**
 * Alertas y eventos del nodo.
 *
 * Salía vacía por el mismo desajuste que la de órdenes: el hook leía
 * `data.data` y la API devuelve `{ resumen, alertas }`. Los eventos
 * estaban guardados todo el tiempo.
 *
 * Las genera el motor de reglas de la Raspberry, no la nube. Corren en
 * el borde para seguir funcionando sin internet, y por eso la lista no
 * se interrumpe durante los cortes: son justo los momentos en que más
 * eventos hay.
 *
 * NO HAY «MARCAR COMO LEÍDA»
 *
 * La versión anterior la ofrecía contra un endpoint que no existe, así
 * que el botón no hacía nada. La tabla `node_eventos` es un registro
 * histórico, no una bandeja de entrada: guarda qué pasó, no quién lo
 * miró. Antes que un botón que miente, no hay botón.
 */
import React, { useState } from 'react';
import {
  Bell, AlertTriangle, Info, AlertOctagon, RefreshCw, Filter, Activity,
} from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import { useAlerts, etiquetaDe } from '@/hooks/useAlerts';
import type { AlertSeverity } from '@/types/alert';

const VENTANAS = [1, 7, 30, 90];

const SEVERIDAD = {
  CRITICAL: {
    icono: AlertOctagon, texto: 'Crítica',
    color: 'text-brand-red', fondo: 'bg-brand-red/10 border-brand-red/25',
  },
  WARNING: {
    icono: AlertTriangle, texto: 'Aviso',
    color: 'text-brand-yellow', fondo: 'bg-brand-yellow/10 border-brand-yellow/25',
  },
  INFO: {
    icono: Info, texto: 'Informativo',
    color: 'text-brand-blue', fondo: 'bg-brand-blue/[0.07] border-brand-blue/20',
  },
} as const;

export default function AlertsPage() {
  const [dias, setDias] = useState(7);
  const [soloGraves, setSoloGraves] = useState(false);
  const { data, isLoading, isFetching, refetch } = useAlerts(dias, 300);

  const todas = data?.alertas ?? [];
  const lista = soloGraves ? todas.filter((a) => a.severity !== 'INFO') : todas;

  const cuenta = (s: AlertSeverity) => todas.filter((a) => a.severity === s).length;

  return (
    <PageContainer>
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Bell size={20} className="text-brand-yellow" />
              Alertas y eventos
            </h1>
            <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
              Las genera el motor de reglas del gateway, no la nube. Por eso la lista
              no se corta durante una caída de red: siguen registrándose en el borde.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
              {VENTANAS.map((v) => (
                <button key={v} onClick={() => setDias(v)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    dias === v ? 'bg-brand-yellow/20 text-brand-yellow font-medium'
                               : 'text-text-secondary hover:text-text-primary'}`}>
                  {v === 1 ? '24 h' : `${v} d`}
                </button>
              ))}
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary
                         hover:bg-white/5 transition-colors border border-brand-border"
              title="Actualizar"
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* ── Recuento por severidad ─────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          {(['CRITICAL', 'WARNING', 'INFO'] as const).map((s) => {
            const cfg = SEVERIDAD[s];
            return (
              <div key={s} className={`rounded-xl border p-4 ${cfg.fondo}`}>
                <p className="text-[11px] uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                  <cfg.icono size={12} /> {cfg.texto}
                </p>
                <p className={`text-2xl font-bold tabular-nums mt-1.5 ${cfg.color}`}>
                  {isLoading ? '—' : cuenta(s)}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  en {dias === 1 ? 'las últimas 24 h' : `los últimos ${dias} días`}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Resumen por tipo ───────────────────────────────── */}
        {data?.resumen?.length ? (
          <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
            <header className="px-4 py-3 border-b border-brand-border">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Activity size={14} className="text-text-muted" /> Qué ha pasado, agrupado
              </h2>
              <p className="text-[11px] text-text-muted mt-1">
                Un tipo repetido muchas veces suele ser una causa única, no muchos incidentes.
              </p>
            </header>
            <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.resumen.map((r) => (
                <div key={r.tipo}
                  className="rounded-lg border border-brand-border bg-bg-secondary px-3 py-2">
                  <p className="text-xs text-text-primary">{etiquetaDe(r.tipo)}</p>
                  <p className="text-[11px] text-text-muted mt-0.5 tabular-nums">
                    <span className="text-text-secondary font-medium">{r.n}</span> veces ·
                    última {new Date(r.ultimo).toLocaleString('es', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Lista ──────────────────────────────────────────── */}
        <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-brand-border">
            <h2 className="text-sm font-semibold text-text-primary">
              Registro cronológico
              {!isLoading && (
                <span className="text-text-muted font-normal ml-2 text-xs tabular-nums">
                  {lista.length} entrada{lista.length === 1 ? '' : 's'}
                </span>
              )}
            </h2>
            <button
              onClick={() => setSoloGraves((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md
                          border transition-colors ${
                soloGraves
                  ? 'border-brand-yellow/40 bg-brand-yellow/15 text-brand-yellow'
                  : 'border-brand-border bg-bg-secondary text-text-secondary hover:text-text-primary'}`}
            >
              <Filter size={11} /> Solo avisos y críticas
            </button>
          </header>

          <div className="p-3">
            {isLoading ? (
              <p className="text-text-muted text-sm py-10 text-center">Cargando…</p>
            ) : !lista.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
                <Bell size={32} className="opacity-30" />
                <p className="text-sm">
                  {soloGraves
                    ? 'Ningún aviso ni alerta crítica en esta ventana.'
                    : 'Sin eventos registrados en esta ventana.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[36rem] overflow-y-auto pr-1">
                {lista.map((a) => {
                  const cfg = SEVERIDAD[a.severity];
                  return (
                    <li key={a.id}
                      className={`rounded-lg border px-3 py-2 flex items-start gap-3 ${cfg.fondo}`}>
                      <cfg.icono size={14} className={`${cfg.color} shrink-0 translate-y-0.5`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text-primary">{a.message}</p>
                        <p className="text-[11px] text-text-muted mt-0.5 font-mono truncate">
                          {a.alert_type}
                          {a.sensor_id && ` · ${a.sensor_id}`}
                        </p>
                      </div>
                      <span className="text-[11px] text-text-muted tabular-nums whitespace-nowrap shrink-0">
                        {new Date(a.created_at).toLocaleString('es', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
