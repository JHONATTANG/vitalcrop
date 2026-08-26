'use client';

/**
 * Tarjeta de KPI contra el objetivo del MCD §9.
 *
 * Cada métrica del §9 tiene un objetivo numérico, así que la tarjeta
 * muestra las dos cifras y colorea según se cumpla. Un número suelto
 * sin su objetivo obliga al lector a recordar la tabla del documento.
 *
 * El estado "sin dato" es un estado de primera clase y se ve distinto
 * de un cero: varias métricas del §9 todavía no están instrumentadas, y
 * pintarlas como 0 sería afirmar una medición que no existe.
 */
import React from 'react';
import { cn } from '@/lib/utils';

export type EstadoKpi = 'cumple' | 'limite' | 'incumple' | 'sin-dato';

interface Props {
  titulo: string;
  valor: string | number | null;
  unidad?: string;
  objetivo?: string;
  estado?: EstadoKpi;
  detalle?: string;
  nota?: string;
}

const ESTILO: Record<EstadoKpi, { chip: string; valor: string; texto: string }> = {
  cumple:     { chip: 'bg-brand-green/15 text-brand-green',  valor: 'text-brand-green',  texto: 'cumple' },
  limite:     { chip: 'bg-brand-yellow/15 text-brand-yellow', valor: 'text-brand-yellow', texto: 'al límite' },
  incumple:   { chip: 'bg-brand-red/15 text-brand-red',      valor: 'text-brand-red',    texto: 'incumple' },
  'sin-dato': { chip: 'bg-white/5 text-text-muted',          valor: 'text-text-muted',   texto: 'sin dato' },
};

export default function KpiTelecom({
  titulo, valor, unidad, objetivo, estado = 'sin-dato', detalle, nota,
}: Props) {
  const e = ESTILO[estado];
  const vacio = valor === null || valor === undefined || valor === '';

  return (
    <div className="rounded-xl border border-brand-border bg-bg-card p-4 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-text-muted leading-tight">
          {titulo}
        </p>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap', e.chip)}>
          {e.texto}
        </span>
      </div>

      <p className={cn('text-2xl font-bold tabular-nums leading-none', vacio ? 'text-text-muted' : e.valor)}>
        {vacio ? '—' : valor}
        {!vacio && unidad && (
          <span className="text-sm font-medium text-text-secondary ml-1">{unidad}</span>
        )}
      </p>

      {objetivo && (
        <p className="text-[11px] text-text-muted">objetivo §9: {objetivo}</p>
      )}
      {detalle && (
        <p className="text-[11px] text-text-secondary tabular-nums">{detalle}</p>
      )}
      {nota && (
        <p className="text-[11px] text-text-muted italic leading-snug mt-0.5">{nota}</p>
      )}
    </div>
  );
}
