'use client';

/**
 * Resumen del cultivo.
 *
 * Tenía tres fallos que se sumaban para dejarla en blanco: pedía los
 * aparatos a una ruta inexistente, leía alertas y órdenes con una forma
 * que la API no devuelve, y pasaba a la telemetría el UUID interno del
 * primer aparato de la lista —que además es el gateway, que no publica
 * sensores— cuando el endpoint espera el identificador del nodo.
 *
 * Ahora se apoya en las mismas agregaciones que el resto del panel. La
 * página no calcula ninguna métrica: si la definición de «pérdida»
 * viviera también aquí, habría dos definiciones en el sistema y
 * ninguna sería la de referencia.
 */
import Link from 'next/link';
import {
  Cpu, Thermometer, Bell, Terminal, Droplets, Wifi, Server,
  ArrowRight, Activity, CloudOff, Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import SerieCompuesta from '@/components/charts/SerieCompuesta';
import BalanceDiario from '@/components/charts/BalanceDiario';
import { useUser } from '@/hooks/useUser';
import { useDevices } from '@/hooks/useDevices';
import { useAlerts } from '@/hooks/useAlerts';
import { useCommands } from '@/hooks/useCommands';
import {
  useResumenTelecom, useGateway, useMultiserie, useDiario, useRiego,
} from '@/hooks/useTelecom';

function Metrica({ titulo, valor, unidad, icono: Icono, tono = 'normal', pie }: {
  titulo: string; valor: React.ReactNode; unidad?: string;
  icono: LucideIcon;
  tono?: 'normal' | 'aviso' | 'critico'; pie?: string;
}) {
  const color = {
    normal:  'text-brand-green',
    aviso:   'text-brand-yellow',
    critico: 'text-brand-red',
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

function Panel({ titulo, sub, children, verMas, icono: Icono }: {
  titulo: string; sub?: string; children: React.ReactNode;
  verMas?: { href: string; texto: string };
  icono?: LucideIcon;
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

export default function DashboardPage() {
  const { data: user } = useUser();
  const dispositivos = useDevices();
  const alertas = useAlerts(7, 200);
  const ordenes = useCommands(30);
  const resumen = useResumenTelecom(7);
  const gateway = useGateway();
  const multi = useMultiserie('temperatura,humedad_ambiente,ec,rssi', 3, 30);
  const diario = useDiario(14);
  const riego = useRiego(7);

  const aparatos = dispositivos.data ?? [];
  const enLinea = aparatos.filter((d) => d.status === 'ONLINE').length;
  const total = aparatos.length;
  const nodo = aparatos.find((d) => d.device_type !== 'GATEWAY');
  const lectura = nodo?.ultima_lectura;

  const graves = alertas.data?.alertas.filter((a) => a.severity !== 'INFO').length ?? 0;
  const pendientes = ordenes.data?.filter((c) => c.estado === 'pendiente').length ?? 0;

  const ciclosSemana = riego.data?.por_dia?.reduce((a, d) => a + d.ciclos, 0) ?? 0;
  const minutosSemana = riego.data?.por_dia?.reduce((a, d) => a + d.min_bomba, 0) ?? 0;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Hola{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-xs text-text-muted mt-1">
              Hierbabuena en ambiente controlado · nodo fog FOG_RPI_HIERBABUENA_01
            </p>
          </div>
          {gateway.data && (
            <span className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${
                gateway.data.estado === 'en linea' ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
              <span className="text-text-secondary">
                última señal hace{' '}
                <span className="tabular-nums">{Math.round(gateway.data.silencio_s / 60)} min</span>
              </span>
            </span>
          )}
        </header>

        {/* ── Métricas ───────────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <Metrica
            titulo="Aparatos en línea"
            valor={dispositivos.isLoading ? '—' : `${enLinea}/${total}`}
            icono={Cpu}
            tono={total === 0 ? 'aviso' : enLinea === total ? 'normal' : enLinea === 0 ? 'critico' : 'aviso'}
            pie={nodo?.firmware_version ? `nodo con firmware ${nodo.firmware_version}` : undefined}
          />
          <Metrica
            titulo="Ambiente ahora"
            valor={lectura?.temperatura ?? '—'}
            unidad="°C"
            icono={Thermometer}
            tono="normal"
            pie={lectura?.humedad !== null && lectura?.humedad !== undefined
              ? `${lectura.humedad} % de humedad relativa` : 'sin lectura reciente'}
          />
          <Metrica
            titulo="Conductividad"
            valor={lectura?.ec ?? '—'}
            unidad="µS/cm"
            icono={Activity}
            tono={!lectura?.ec ? 'aviso' : lectura.ec < 400 ? 'aviso' : 'normal'}
            pie={lectura?.ec ? 'solución de la balsa de raíz flotante' : 'sin medición reciente'}
          />
          <Metrica
            titulo="Calidad del enlace"
            valor={resumen.data?.rssi?.media ?? '—'}
            unidad="dBm"
            icono={Wifi}
            tono={!resumen.data?.rssi?.media ? 'aviso'
              : resumen.data.rssi.media > -70 ? 'normal' : 'critico'}
            pie={resumen.data?.perdida
              ? `${resumen.data.perdida.pct} % de pérdida en 7 días`
              : undefined}
          />
        </div>

        {/* ── Segunda fila ───────────────────────────────────── */}
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <Metrica
            titulo="Riego esta semana"
            valor={ciclosSemana}
            unidad="ciclos"
            icono={Droplets}
            tono="normal"
            pie={`${minutosSemana.toFixed(0)} minutos de bomba, contados por evento`}
          />
          <Metrica
            titulo="Avisos y críticas"
            valor={alertas.isLoading ? '—' : graves}
            icono={Bell}
            tono={graves === 0 ? 'normal' : graves > 5 ? 'critico' : 'aviso'}
            pie="en los últimos 7 días"
          />
          <Metrica
            titulo="Órdenes sin entregar"
            valor={ordenes.isLoading ? '—' : pendientes}
            icono={Terminal}
            tono={pendientes === 0 ? 'normal' : 'aviso'}
            pie={pendientes ? 'esperando a que el gateway las recoja' : 'todas entregadas'}
          />
          <Metrica
            titulo="Reinicios del nodo"
            valor={resumen.data?.reinicios_nodo?.n ?? '—'}
            icono={Server}
            tono={(resumen.data?.reinicios_nodo?.n ?? 0) === 0 ? 'normal' : 'aviso'}
            pie="en 7 días, por retroceso del contador de marcha"
          />
        </div>

        {/* ── Aviso si no hay aparatos ───────────────────────── */}
        {!dispositivos.isLoading && total === 0 && (
          <div className="rounded-xl border border-brand-yellow/30 bg-brand-yellow/10 px-4 py-3
                          text-xs text-brand-yellow flex items-start gap-2">
            <CloudOff size={14} className="shrink-0 translate-y-0.5" />
            <span>
              No hay ningún aparato asociado a esta cuenta. El gateway y sus nodos se dan de
              alta una vez y quedan vinculados al usuario que los registró.
            </span>
          </div>
        )}

        {/* ── Últimas 72 h ───────────────────────────────────── */}
        <Panel
          icono={Activity}
          titulo="Las últimas 72 horas"
          sub="Ambiente y enlace sobre el mismo eje. Las franjas oscuras son las horas sin luz: casi todo lo que oscila sigue ese ciclo."
          verMas={{ href: '/telecom', texto: 'Análisis completo' }}
        >
          <SerieCompuesta
            puntos={multi.data?.puntos ?? []}
            metricas={multi.data?.metricas ?? ['temperatura', 'humedad_ambiente', 'ec', 'rssi']}
            fotoperiodo={{ on: 6, off: 18 }}
            alto={320}
          />
        </Panel>

        {/* ── Balance ────────────────────────────────────────── */}
        <Panel
          icono={Clock}
          titulo="Cobertura y trabajo de los últimos 14 días"
          sub="Lo que se esperaba recibir cada día frente a lo que llegó, con el riego ejecutado y la señal media superpuestos."
          verMas={{ href: '/fog', texto: 'Autonomía del borde' }}
        >
          <BalanceDiario dias={diario.data?.dias ?? []} alto={300} />
        </Panel>

        {/* ── Aparatos y últimas alertas ─────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            icono={Cpu}
            titulo="Aparatos"
            verMas={{ href: '/devices', texto: 'Ver todos' }}
          >
            {dispositivos.isLoading ? (
              <p className="text-text-muted text-sm py-6 text-center">Cargando…</p>
            ) : !aparatos.length ? (
              <p className="text-text-muted text-sm py-6 text-center">Sin aparatos dados de alta</p>
            ) : (
              <ul className="space-y-2">
                {aparatos.map((d) => (
                  <li key={d.id}
                    className="flex items-center gap-3 rounded-lg border border-brand-border
                               bg-bg-secondary px-3 py-2">
                    {d.device_type === 'GATEWAY'
                      ? <Server size={15} className="text-brand-blue shrink-0" />
                      : <Cpu size={15} className="text-brand-green shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{d.alias}</p>
                      <p className="text-[11px] text-text-muted font-mono truncate">{d.device_uid}</p>
                    </div>
                    <span className={`text-[11px] font-medium shrink-0 ${
                      d.status === 'ONLINE' ? 'text-brand-green'
                        : d.status === 'ERROR' ? 'text-brand-yellow'
                        : d.status === 'OFFLINE' ? 'text-brand-red' : 'text-text-muted'}`}>
                      {d.status === 'ONLINE' ? 'en línea'
                        : d.status === 'ERROR' ? 'con retraso'
                        : d.status === 'OFFLINE' ? 'sin respuesta' : 'sin telemetría'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            icono={Bell}
            titulo="Últimos eventos"
            verMas={{ href: '/alerts', texto: 'Ver todos' }}
          >
            {alertas.isLoading ? (
              <p className="text-text-muted text-sm py-6 text-center">Cargando…</p>
            ) : !alertas.data?.alertas.length ? (
              <p className="text-text-muted text-sm py-6 text-center">Sin eventos en 7 días</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {alertas.data.alertas.slice(0, 14).map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2 text-xs
                                            border-b border-brand-border/30 pb-1">
                    <span className="text-text-muted tabular-nums whitespace-nowrap shrink-0">
                      {new Date(a.created_at).toLocaleString('es', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={
                      a.severity === 'CRITICAL' ? 'text-brand-red'
                        : a.severity === 'WARNING' ? 'text-brand-yellow'
                        : 'text-text-secondary'
                    }>
                      {a.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  );
}
