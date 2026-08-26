'use client';

/**
 * Panel de telecomunicaciones — MCD §9.
 *
 * Es el eje evaluativo del proyecto: todo lo demás del sistema es la
 * infraestructura que permite medir esto.
 *
 * Dos principios de la página:
 *
 *   · No inventar. Las métricas que todavía no están instrumentadas se
 *     muestran como «sin dato» con la razón, en lugar de un cero. Un
 *     panel que pinta ceros donde no midió afirma una medición que no
 *     existe.
 *
 *   · Cruzar antes que enumerar. Una métrica sola casi nunca responde
 *     una pregunta: el RSSI medio no dice si el enlace estorba, y sí lo
 *     dice cruzado con las tramas perdidas del mismo día. Las gráficas
 *     de esta página están ordenadas de lo agregado a lo cruzado.
 */
import React, { useState } from 'react';
import {
  Activity, PackageX, Timer, Server, Droplets, Network,
  TrendingUp, Clock, Radio, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import {
  useResumenTelecom, useHeatmap, useDistribucion, useSerie,
  useEventos, useRiego, useGateway, useMultiserie, useDiario,
  useCorrelacion, usePerfilHorario,
} from '@/hooks/useTelecom';
import { useDevices } from '@/hooks/useDevices';

import KpiTelecom, { EstadoKpi } from '@/components/telecom/KpiTelecom';
import HeatmapHoraDia from '@/components/telecom/HeatmapHoraDia';
import DistribucionCDF from '@/components/telecom/DistribucionCDF';
import SerieBanda from '@/components/telecom/SerieBanda';
import SerieCompuesta from '@/components/charts/SerieCompuesta';
import BalanceDiario from '@/components/charts/BalanceDiario';
import Correlacion from '@/components/charts/Correlacion';
import PerfilHorario from '@/components/charts/PerfilHorario';
import MapaTopologia from '@/components/topologia/MapaTopologia';

const VENTANAS = [1, 7, 14, 30];

const METRICAS_MAPA = [
  { id: 'rssi', etiqueta: 'RSSI', unidad: 'dBm', invertir: true },
  { id: 'temperatura', etiqueta: 'Temperatura', unidad: '°C', invertir: false },
  { id: 'ec', etiqueta: 'Conductividad', unidad: 'µS/cm', invertir: false },
  { id: 'tramas', etiqueta: 'Tramas recibidas', unidad: '', invertir: false },
];

const CRUCES = [
  { x: 'temperatura', y: 'ec', etiqueta: 'Temperatura × conductividad' },
  { x: 'temperatura', y: 'rssi', etiqueta: 'Temperatura × RSSI' },
  { x: 'humedad_ambiente', y: 'temperatura', etiqueta: 'Humedad × temperatura' },
  { x: 'rssi', y: 'ec', etiqueta: 'RSSI × conductividad' },
];

const FOTOPERIODO = { on: 6, off: 18 };

function Panel({ titulo, sub, children, accion, icono: Icono }: {
  titulo: string;
  sub?: string;
  children: React.ReactNode;
  accion?: React.ReactNode;
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
        {accion}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Selector<T extends string | number>({ opciones, valor, onChange }: {
  opciones: Array<{ id: T; etiqueta: string }>;
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
      {opciones.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
            valor === o.id
              ? 'bg-brand-blue/20 text-brand-blue font-medium'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

export default function TelecomPage() {
  const [dias, setDias] = useState(7);
  const [metricaMapa, setMetricaMapa] = useState('rssi');
  const [cruce, setCruce] = useState(0);
  const [bucket, setBucket] = useState(30);

  const resumen = useResumenTelecom(dias);
  const mapa = useHeatmap(metricaMapa, Math.max(dias, 7));
  const dist = useDistribucion('rssi', dias, 24);
  const serieRssi = useSerie('rssi', dias, 30);
  const eventos = useEventos(dias);
  const riego = useRiego(Math.max(dias, 14));
  const gateway = useGateway();
  const multi = useMultiserie('temperatura,humedad_ambiente,ec,rssi', dias, bucket);
  const diario = useDiario(Math.max(dias, 21));
  const corr = useCorrelacion(CRUCES[cruce].x, CRUCES[cruce].y, Math.max(dias, 14));
  const perfil = usePerfilHorario(Math.max(dias, 14));
  const dispositivos = useDevices();

  const r = resumen.data;
  const cfgMapa = METRICAS_MAPA.find((m) => m.id === metricaMapa)!;

  // ── Estados frente a los objetivos del §9 ───────────────────
  const estadoPerdida: EstadoKpi = !r?.perdida?.pct && r?.perdida?.pct !== 0
    ? 'sin-dato'
    : r.perdida.pct! < r.perdida.objetivo_pct ? 'cumple' : 'incumple';

  const estadoRssi: EstadoKpi = !r?.rssi?.media
    ? 'sin-dato'
    : r.rssi.media > -70 ? (r.rssi.pct_bajo_umbral! > 5 ? 'limite' : 'cumple') : 'incumple';

  const lat = r?.latencia_subida;
  const estadoLatencia: EstadoKpi = !lat?.n ? 'sin-dato'
    : (lat.media_ms ?? Infinity) < lat.objetivo_ms ? 'cumple' : 'limite';

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        {/* ── Cabecera ───────────────────────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Activity size={20} className="text-brand-blue" />
              Telecomunicaciones
            </h1>
            <p className="text-xs text-text-muted mt-1">
              Desempeño de la cadena ESP32 → nodo fog → nube · métricas del MCD §9
            </p>
          </div>

          <Selector
            valor={dias}
            onChange={setDias}
            opciones={VENTANAS.map((d) => ({
              id: d, etiqueta: d === 1 ? 'Últimas 24 h' : `${d} días`,
            }))}
          />
        </header>

        {/* ── Estado del gateway ─────────────────────────────── */}
        {gateway.data && (
          <div className="rounded-xl border border-brand-border bg-bg-card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <span className="flex items-center gap-2">
              <Server size={14} className="text-text-muted" />
              <span className="text-text-secondary">Nodo fog</span>
              <span className={gateway.data.estado === 'en linea'
                ? 'text-brand-green font-medium' : 'text-brand-yellow font-medium'}>
                {gateway.data.estado === 'en linea' ? 'en línea' : gateway.data.estado}
              </span>
            </span>
            <span className="text-text-muted">
              última trama hace{' '}
              <span className="tabular-nums text-text-secondary">
                {Math.round(gateway.data.silencio_s / 60)} min
              </span>
            </span>
            <span className="text-text-muted">
              tramas subidas en vivo:{' '}
              <span className="tabular-nums text-text-secondary">
                {gateway.data.ingesta_en_vivo.toLocaleString()}
              </span>
            </span>
            {gateway.data.por_origen?.map((o) => (
              <span key={o.origen} className="text-text-muted">
                {o.origen === 'backfill' ? 'carga histórica' : o.origen}:{' '}
                <span className="tabular-nums text-text-secondary">{o.n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        )}

        {/* ── KPIs ───────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTelecom
            titulo="Pérdida de mensajes"
            valor={r?.perdida?.pct ?? null}
            unidad="%"
            objetivo="< 1 %"
            estado={estadoPerdida}
            detalle={r ? `${r.perdida.perdidas} de ${r.perdida.esperadas.toLocaleString()} esperadas` : undefined}
          />
          <KpiTelecom
            titulo="RSSI medio"
            valor={r?.rssi?.media ?? null}
            unidad="dBm"
            objetivo="> −70 dBm"
            estado={estadoRssi}
            detalle={r?.rssi ? `p05 ${r.rssi.p05} · p95 ${r.rssi.p95} · ${r.rssi.pct_bajo_umbral} % bajo umbral` : undefined}
          />
          <KpiTelecom
            titulo="Reinicios del nodo"
            valor={r?.reinicios_nodo?.n ?? null}
            objetivo="disponibilidad > 99 %"
            estado={
              r?.reinicios_nodo?.n === undefined ? 'sin-dato'
                : r.reinicios_nodo.n === 0 ? 'cumple' : 'limite'
            }
            detalle={`en ${dias} días · detectados por retroceso del contador de marcha`}
          />
          <KpiTelecom
            titulo="Latencia de subida"
            valor={lat?.media_ms ?? null}
            unidad="ms"
            objetivo="< 1500 ms"
            estado={estadoLatencia}
            detalle={lat?.n
              ? `mediana ${Math.round(lat.p50_ms ?? 0)} ms · mínimo ${lat.minimo_ms} ms · ${lat.n} tramas en vivo`
              : undefined}
            nota={lat?.n ? undefined : lat?.estado}
          />
        </div>

        {/* Recuperación del buffer: va debajo de la latencia porque es
            la nota al pie de esa cifra, no una métrica independiente. */}
        {r?.recuperacion_de_buffer?.n ? (
          <p className="text-[11px] text-text-muted px-1 -mt-1">
            Además de esas tramas en vivo,{' '}
            <span className="text-text-secondary tabular-nums font-medium">
              {r.recuperacion_de_buffer.n.toLocaleString()}
            </span>{' '}
            llegaron desde el buffer del borde tras un corte, con una espera máxima de{' '}
            <span className="text-text-secondary tabular-nums">{r.recuperacion_de_buffer.peor_horas} h</span>.
            No se promedian con las de arriba: describirían un camino distinto.
          </p>
        ) : null}

        {/* ── Balance diario ─────────────────────────────────── */}
        <Panel
          icono={Layers}
          titulo="Balance diario: cobertura, señal y trabajo del cultivo"
          sub="Las tres cosas que el resto de la página muestra por separado, sobre el mismo día. Las barras apiladas son lo que se esperaba recibir; el trozo rojo, lo que faltó. La línea azul es el RSSI medio y los triángulos marcan los días con reinicios."
        >
          <BalanceDiario dias={diario.data?.dias ?? []} />
        </Panel>

        {/* ── Serie compuesta ────────────────────────────────── */}
        <Panel
          icono={TrendingUp}
          titulo="Ambiente y enlace sobre el mismo eje de tiempo"
          sub="Cuatro métricas en escalas que no se parecen, repartidas en dos ejes. Las franjas oscuras son las horas sin luz: casi todo lo que se ve oscilar sigue ese ciclo."
          accion={
            <Selector
              valor={bucket}
              onChange={setBucket}
              opciones={[
                { id: 10, etiqueta: '10 min' },
                { id: 30, etiqueta: '30 min' },
                { id: 60, etiqueta: '1 h' },
                { id: 180, etiqueta: '3 h' },
              ]}
            />
          }
        >
          <SerieCompuesta
            puntos={multi.data?.puntos ?? []}
            metricas={multi.data?.metricas ?? ['temperatura', 'humedad_ambiente', 'ec', 'rssi']}
            fotoperiodo={FOTOPERIODO}
            alto={360}
          />
        </Panel>

        {/* ── Mapa de calor ──────────────────────────────────── */}
        <Panel
          icono={Radio}
          titulo="Mapa de calor hora × día"
          sub="Plegar el tiempo sobre sí mismo revela patrones horarios que una serie de 31.000 puntos esconde. Una banda vertical significa «pasa a esa hora todos los días»."
          accion={
            <Selector
              valor={metricaMapa}
              onChange={setMetricaMapa}
              opciones={METRICAS_MAPA.map((m) => ({ id: m.id, etiqueta: m.etiqueta }))}
            />
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

        {/* ── Perfil horario y correlación ───────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            icono={Clock}
            titulo="El día tipo, en reloj"
            sub="La ventana entera colapsada en 24 horas. El día es circular y una gráfica de barras lo corta por un punto arbitrario; aquí el patrón se cierra sobre sí mismo."
          >
            <PerfilHorario
              horas={perfil.data?.horas ?? []}
              riegoPorHora={perfil.data?.riego_por_hora ?? []}
              fotoperiodo={FOTOPERIODO}
            />
          </Panel>

          <Panel
            icono={Network}
            titulo="Cruce entre dos variables"
            sub="Lo que una serie temporal esconde: si dos cosas suben juntas por relación o por coincidencia. El color es la hora del día, y una nube que se separa en dos brazos delata que la variable real es el fotoperiodo."
            accion={
              <Selector
                valor={cruce}
                onChange={setCruce}
                opciones={CRUCES.map((c, i) => ({ id: i, etiqueta: c.etiqueta }))}
              />
            }
          >
            <Correlacion
              puntos={corr.data?.puntos ?? []}
              x={corr.data?.x ?? CRUCES[cruce].x}
              y={corr.data?.y ?? CRUCES[cruce].y}
              r={corr.data?.r}
              alto={340}
            />
          </Panel>
        </div>

        {/* ── Distribución y serie de RSSI ───────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            titulo="Distribución del RSSI y acumulada"
            sub="La curva acumulada responde «qué porcentaje del tiempo estuve bajo el umbral», que es la pregunta del §9 y no la que responde una media."
          >
            <DistribucionCDF
              bins={dist.data?.bins ?? []}
              unidad="dBm"
              umbral={-70}
              etiquetaUmbral="umbral −70 dBm"
            />
          </Panel>

          <Panel
            titulo="RSSI en el tiempo, con su dispersión"
            sub="Media por bucket de 30 min con la banda de mínimo y máximo. Dos buckets con la misma media pueden esconder uno estable y otro oscilando 20 dB."
          >
            <SerieBanda
              puntos={serieRssi.data?.puntos ?? []}
              unidad="dBm"
              color="#3B82F6"
              umbral={-70}
            />
          </Panel>
        </div>

        {/* ── Topología ──────────────────────────────────────── */}
        <Panel
          icono={Network}
          titulo="Mapa de la instalación"
          sub="La misma arquitectura del informe, pero con los aparatos que hay dados de alta ahora y su estado real. Se puede arrastrar y acercar: el grosor de cada enlace codifica su calidad."
        >
          <MapaTopologia
            dispositivos={dispositivos.data ?? []}
            silencioNube={gateway.data?.silencio_s ?? null}
            alto={470}
          />
        </Panel>

        {/* ── Jitter ─────────────────────────────────────────── */}
        <Panel
          icono={Timer}
          titulo="Jitter por cadencia"
          sub="Desviación del intervalo real de llegada frente al periodo programado. El MCD lo dejaba «por caracterizar»; estas son las cifras medidas."
        >
          {r?.jitter_por_cadencia?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {r.jitter_por_cadencia.map((j) => (
                <div key={j.cadencia_s} className="rounded-lg border border-brand-border bg-bg-secondary p-3">
                  <p className="text-[11px] text-text-muted flex items-center gap-1.5">
                    <Timer size={12} /> cadencia de {j.cadencia_s} s
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

        {/* ── Riego y eventos ────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            icono={Droplets}
            titulo="Ciclos de riego contados"
            sub="Del evento de fin, con la duración real medida por el nodo. No se puede derivar del muestreo: un ciclo de 3 min cabe entero entre dos tramas de 5."
          >
            {riego.data?.por_dia?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[22rem]">
                  <thead>
                    <tr className="text-text-muted border-b border-brand-border">
                      <th className="text-left font-medium py-1.5">Día</th>
                      <th className="text-right font-medium">Ciclos</th>
                      <th className="text-right font-medium">Minutos de bomba</th>
                      <th className="text-right font-medium">Duración</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {riego.data.por_dia.slice().reverse().map((d) => (
                      <tr key={d.dia} className="border-b border-brand-border/40">
                        <td className="py-1.5 text-text-secondary">
                          {new Date(d.dia).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="text-right text-text-primary">{d.ciclos}</td>
                        <td className="text-right text-brand-green">{d.min_bomba}</td>
                        <td className="text-right text-text-muted">
                          {d.s_min === d.s_max ? `${d.s_min} s` : `${d.s_min}–${d.s_max} s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-text-muted text-sm py-6 text-center flex items-center justify-center gap-2">
                <Droplets size={14} /> Sin ciclos registrados
              </p>
            )}
          </Panel>

          <Panel
            titulo="Eventos del nodo"
            sub="Caídas, reconexiones y discrepancias de programa. El registro de systemd rota cada pocos días; esta tabla no."
          >
            {eventos.data?.resumen?.length ? (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {eventos.data.resumen.map((s) => (
                    <span key={s.evento}
                      className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary border border-brand-border text-text-secondary">
                      {s.evento.replace(/_/g, ' ')}{' '}
                      <span className="text-text-primary font-medium tabular-nums">{s.n}</span>
                    </span>
                  ))}
                </div>
                <ul className="space-y-1 max-h-72 overflow-y-auto text-xs pr-1">
                  {eventos.data.eventos.slice(0, 60).map((e, i) => (
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
                        {e.evento.replace(/_/g, ' ')}
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

        {/* ── Lo que no se mide ──────────────────────────────── */}
        {r?.no_instrumentado && (
          <Panel
            icono={PackageX}
            titulo="Métricas del §9 todavía sin instrumentar"
            sub="Se declaran en vez de pintarse como cero. Un panel que muestra ceros donde no midió afirma una medición que no existe."
          >
            <ul className="space-y-2 text-xs">
              {Object.entries(r.no_instrumentado).map(([k, v]) => (
                <li key={k} className="flex gap-3 items-baseline">
                  <PackageX size={13} className="text-text-muted shrink-0 translate-y-0.5" />
                  <span className="text-text-secondary font-medium sm:min-w-[16rem]">
                    {k.replace(/_/g, ' ')}
                  </span>
                  <span className="text-text-muted">{v}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* ── Cobertura ──────────────────────────────────────── */}
        {r?.cobertura && (
          <p className="text-[11px] text-text-muted text-center pt-2 pb-4 tabular-nums">
            {r.cobertura.tramas.toLocaleString()} tramas · {r.cobertura.nodos} nodo ·{' '}
            {r.cobertura.versiones_fw} versiones de firmware ·{' '}
            {r.cobertura.desde && new Date(r.cobertura.desde).toLocaleDateString('es')} →{' '}
            {r.cobertura.hasta && new Date(r.cobertura.hasta).toLocaleDateString('es')}
          </p>
        )}
      </div>
    </PageContainer>
  );
}
