'use client';

/**
 * Panel de telecomunicaciones — MCD §9.
 *
 * Es el eje evaluativo del proyecto: todo lo demás del sistema es la
 * infraestructura que permite medir esto.
 *
 * Principio de la página: no inventar. Las métricas que todavía no
 * están instrumentadas se muestran como "sin dato" con la razón, en
 * lugar de un cero o un hueco. Un panel que pinta ceros donde no midió
 * es peor que uno que no pinta nada, porque parece una medición.
 */
import React, { useState } from 'react';
import {
  Activity, Radio, PackageX, Timer, RefreshCw, Waves, Server, Droplets,
} from 'lucide-react';

import {
  useResumenTelecom, useHeatmap, useDistribucion, useSerie,
  useEventos, useRiego, useGateway,
} from '@/hooks/useTelecom';
import KpiTelecom, { EstadoKpi } from '@/components/telecom/KpiTelecom';
import HeatmapHoraDia from '@/components/telecom/HeatmapHoraDia';
import DistribucionCDF from '@/components/telecom/DistribucionCDF';
import SerieBanda from '@/components/telecom/SerieBanda';

const VENTANAS = [1, 7, 14, 30];
const METRICAS_MAPA = [
  { id: 'rssi', etiqueta: 'RSSI', unidad: 'dBm', invertir: true },
  { id: 'temperatura', etiqueta: 'Temperatura', unidad: '°C', invertir: false },
  { id: 'ec', etiqueta: 'Conductividad', unidad: 'µS/cm', invertir: false },
  { id: 'tramas', etiqueta: 'Tramas recibidas', unidad: '', invertir: false },
];

function Panel({ titulo, sub, children, accion }: {
  titulo: string; sub?: string; children: React.ReactNode; accion?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
      <header className="flex items-start justify-between gap-4 px-4 py-3 border-b border-brand-border">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{titulo}</h2>
          {sub && <p className="text-[11px] text-text-muted mt-0.5 max-w-2xl">{sub}</p>}
        </div>
        {accion}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export default function TelecomPage() {
  const [dias, setDias] = useState(7);
  const [metricaMapa, setMetricaMapa] = useState('rssi');

  const resumen = useResumenTelecom(dias);
  const mapa = useHeatmap(metricaMapa, Math.max(dias, 7));
  const dist = useDistribucion('rssi', dias, 24);
  const serieRssi = useSerie('rssi', dias, 30);
  const serieEc = useSerie('ec', dias, 60);
  const eventos = useEventos(dias);
  const riego = useRiego(Math.max(dias, 14));
  const gateway = useGateway();

  const r = resumen.data;
  const cfgMapa = METRICAS_MAPA.find((m) => m.id === metricaMapa)!;

  // ── Estados frente a los objetivos del §9 ───────────────────
  const estadoPerdida: EstadoKpi = !r?.perdida?.pct && r?.perdida?.pct !== 0
    ? 'sin-dato'
    : r.perdida.pct! < r.perdida.objetivo_pct ? 'cumple' : 'incumple';

  const estadoRssi: EstadoKpi = !r?.rssi?.media
    ? 'sin-dato'
    : r.rssi.media > -70 ? (r.rssi.pct_bajo_umbral! > 5 ? 'limite' : 'cumple') : 'incumple';

  return (
    <div className="space-y-4">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Activity size={20} className="text-brand-blue" />
            Telecomunicaciones
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Desempeño de la cadena ESP32 → gateway fog → nube · métricas del MCD §9
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
          {VENTANAS.map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                dias === d
                  ? 'bg-brand-blue/20 text-brand-blue font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {d === 1 ? '24 h' : `${d} d`}
            </button>
          ))}
        </div>
      </header>

      {/* ── Estado del gateway ───────────────────────────────── */}
      {gateway.data && (
        <div className="rounded-xl border border-brand-border bg-bg-card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <Server size={14} className="text-text-muted" />
            <span className="text-text-secondary">Gateway</span>
            <span className={gateway.data.estado === 'en linea'
              ? 'text-brand-green font-medium' : 'text-brand-yellow font-medium'}>
              {gateway.data.estado}
            </span>
          </span>
          <span className="text-text-muted">
            última trama hace{' '}
            <span className="tabular-nums text-text-secondary">
              {Math.round(gateway.data.silencio_s / 60)} min
            </span>
          </span>
          <span className="text-text-muted">
            ingesta en vivo:{' '}
            <span className="tabular-nums text-text-secondary">
              {gateway.data.ingesta_en_vivo}
            </span>
          </span>
          {gateway.data.por_origen?.map((o) => (
            <span key={o.origen} className="text-text-muted">
              {o.origen}:{' '}
              <span className="tabular-nums text-text-secondary">{o.n}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTelecom
          titulo="Pérdida de mensajes"
          valor={r?.perdida?.pct ?? null}
          unidad="%"
          objetivo="< 1 %"
          estado={estadoPerdida}
          detalle={r ? `${r.perdida.perdidas} de ${r.perdida.esperadas} esperadas` : undefined}
        />
        <KpiTelecom
          titulo="RSSI medio"
          valor={r?.rssi?.media ?? null}
          unidad="dBm"
          objetivo="> −70 dBm"
          estado={estadoRssi}
          detalle={r?.rssi ? `p05 ${r.rssi.p05} · p95 ${r.rssi.p95} · ${r.rssi.pct_bajo_umbral}% bajo umbral` : undefined}
        />
        <KpiTelecom
          titulo="Reinicios del nodo"
          valor={r?.reinicios_nodo?.n ?? null}
          objetivo="disponibilidad > 99 %"
          estado={
            r?.reinicios_nodo?.n === undefined ? 'sin-dato'
              : r.reinicios_nodo.n === 0 ? 'cumple' : 'limite'
          }
          detalle={`en ${dias} días · detectados por retroceso de uptime`}
        />
        <KpiTelecom
          titulo="Latencia de subida"
          valor={r?.latencia_subida?.media_ms ?? null}
          unidad="ms"
          objetivo="< 1500 ms"
          estado={(r?.latencia_subida?.n ?? 0) > 0 ? 'cumple' : 'sin-dato'}
          nota={(r?.latencia_subida?.n ?? 0) > 0 ? undefined : r?.latencia_subida?.estado}
        />
      </div>

      {/* ── Jitter ───────────────────────────────────────────── */}
      <Panel
        titulo="Jitter por cadencia"
        sub="Desviación del intervalo real de llegada frente al periodo programado. El MCD lo dejaba «por caracterizar»; estas son las cifras."
      >
        {r?.jitter_por_cadencia?.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {r.jitter_por_cadencia.map((j) => (
              <div key={j.cadencia_s} className="rounded-lg border border-brand-border bg-bg-secondary p-3">
                <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                  <Timer size={12} /> cadencia {j.cadencia_s} s
                </p>
                <p className="text-xl font-bold text-brand-blue tabular-nums mt-1">
                  σ {j.sigma_s}<span className="text-xs text-text-secondary ml-1">s</span>
                </p>
                <p className="text-[11px] text-text-muted tabular-nums mt-1">
                  media {j.media_s} s · {j.n.toLocaleString()} intervalos
                </p>
                <p className="text-[11px] text-text-muted tabular-nums">
                  {(100 * j.sigma_s / j.cadencia_s).toFixed(2)} % del periodo
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-sm py-6 text-center">Sin intervalos limpios en la ventana</p>
        )}
      </Panel>

      {/* ── Mapa de calor ────────────────────────────────────── */}
      <Panel
        titulo="Mapa de calor hora × día"
        sub="Plegar el tiempo sobre sí mismo revela patrones horarios que una serie de 31.000 puntos esconde. Una banda vertical significa «pasa a esa hora todos los días»."
        accion={
          <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
            {METRICAS_MAPA.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetricaMapa(m.id)}
                className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
                  metricaMapa === m.id
                    ? 'bg-brand-blue/20 text-brand-blue font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        }
      >
        {mapa.isLoading ? (
          <p className="text-text-muted text-sm py-10 text-center">Cargando…</p>
        ) : (
          <HeatmapHoraDia
            celdas={mapa.data?.celdas ?? []}
            min={mapa.data?.min ?? 0}
            max={mapa.data?.max ?? 1}
            unidad={cfgMapa.unidad}
            invertir={cfgMapa.invertir}
          />
        )}
      </Panel>

      {/* ── Distribución y serie ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Distribución del RSSI y acumulada"
          sub="La CDF responde «qué porcentaje del tiempo estuve bajo el umbral», que es la pregunta del §9."
        >
          <DistribucionCDF
            bins={dist.data?.bins ?? []}
            unidad="dBm"
            umbral={-70}
            etiquetaUmbral="umbral −70 dBm"
          />
        </Panel>

        <Panel
          titulo="RSSI en el tiempo"
          sub="Media por bucket de 30 min, con la banda de mínimo y máximo de cada uno."
        >
          <SerieBanda
            puntos={serieRssi.data?.puntos ?? []}
            unidad="dBm"
            color="#3B82F6"
            umbral={-70}
          />
        </Panel>
      </div>

      {/* ── Conductividad ────────────────────────────────────── */}
      <Panel
        titulo="Conductividad de la solución"
        sub="Variable de proceso, no de red: aquí porque su deriva delata evaporación en el tanque antes de que el nivel baje visiblemente."
      >
        <SerieBanda puntos={serieEc.data?.puntos ?? []} unidad="µS/cm" color="#10B981" />
      </Panel>

      {/* ── Riego y eventos ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Ciclos de riego contados"
          sub="Del evento de fin, con la duración real medida por el nodo. No se puede derivar del muestreo: un ciclo de 3 min cabe entre dos tramas de 5."
        >
          {riego.data?.por_dia?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-brand-border">
                  <th className="text-left font-medium py-1.5">Día</th>
                  <th className="text-right font-medium">Ciclos</th>
                  <th className="text-right font-medium">Min. bomba</th>
                  <th className="text-right font-medium">Duración</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {riego.data.por_dia.slice().reverse().map((d) => (
                  <tr key={d.dia} className="border-b border-brand-border/40">
                    <td className="py-1.5 text-text-secondary">{d.dia}</td>
                    <td className="text-right text-text-primary">{d.ciclos}</td>
                    <td className="text-right text-brand-green">{d.min_bomba}</td>
                    <td className="text-right text-text-muted">
                      {d.s_min === d.s_max ? `${d.s_min} s` : `${d.s_min}–${d.s_max} s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-text-muted text-sm py-6 text-center flex items-center justify-center gap-2">
              <Droplets size={14} /> Sin ciclos registrados
            </p>
          )}
        </Panel>

        <Panel
          titulo="Eventos del nodo"
          sub="Caídas, reconexiones y discrepancias de programa. El journal de systemd rota; esta tabla no."
        >
          {eventos.data?.resumen?.length ? (
            <>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {eventos.data.resumen.map((s) => (
                  <span key={s.evento}
                    className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary border border-brand-border text-text-secondary">
                    {s.evento} <span className="text-text-primary font-medium">{s.n}</span>
                  </span>
                ))}
              </div>
              <ul className="space-y-1 max-h-64 overflow-y-auto text-xs">
                {eventos.data.eventos.slice(0, 40).map((e, i) => (
                  <li key={i} className="flex items-baseline gap-2 border-b border-brand-border/30 pb-1">
                    <span className="text-text-muted tabular-nums whitespace-nowrap">
                      {new Date(e.ts).toLocaleString('es', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span className={
                      e.evento.startsWith('riego') ? 'text-brand-green'
                        : e.evento === 'desconectado' ? 'text-brand-red'
                        : e.evento === 'conectado' ? 'text-brand-blue'
                        : 'text-brand-yellow'
                    }>
                      {e.evento}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-text-muted text-sm py-6 text-center">Sin eventos</p>
          )}
        </Panel>
      </div>

      {/* ── Lo que no se mide ────────────────────────────────── */}
      {r?.no_instrumentado && (
        <Panel
          titulo="Métricas del §9 todavía sin instrumentar"
          sub="Se declaran en vez de pintarse como cero. Un panel que muestra ceros donde no midió afirma una medición que no existe."
        >
          <ul className="space-y-2 text-xs">
            {Object.entries(r.no_instrumentado).map(([k, v]) => (
              <li key={k} className="flex gap-3 items-baseline">
                <PackageX size={13} className="text-text-muted shrink-0 translate-y-0.5" />
                <span className="text-text-secondary font-medium min-w-[16rem]">
                  {k.replace(/_/g, ' ')}
                </span>
                <span className="text-text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ── Cobertura ────────────────────────────────────────── */}
      {r?.cobertura && (
        <p className="text-[11px] text-text-muted text-center pt-2 tabular-nums">
          {r.cobertura.tramas.toLocaleString()} tramas · {r.cobertura.nodos} nodo ·{' '}
          {r.cobertura.versiones_fw} versiones de firmware ·{' '}
          {r.cobertura.desde && new Date(r.cobertura.desde).toLocaleDateString('es')} →{' '}
          {r.cobertura.hasta && new Date(r.cobertura.hasta).toLocaleDateString('es')}
        </p>
      )}
    </div>
  );
}
