'use client';

/**
 * Fog computing — la autonomía del borde, medida.
 *
 * El proyecto declara la "resiliencia de borde distribuida" como su
 * aporte innovador. Hasta ahora eso se sostenía con un diagrama de
 * arquitectura; esta página lo sostiene con cuentas.
 *
 * El argumento tiene una forma verificable: durante toda la ventana de
 * datos la nube estuvo apagada, y el cultivo se regó, se iluminó y se
 * corrigió solo. Cada decisión dejó un evento, y los eventos se cuentan.
 *
 * NOTA DE ARQUITECTURA: la nube no puede consultar a la Raspberry. Está
 * detrás del NAT del router y su red de cultivo no tiene salida. Todo
 * lo que se ve aquí está inferido del flujo de datos que el gateway
 * produce — que es, además, la única señal que un operador remoto real
 * tendría de él.
 */
import React, { useState } from 'react';
import {
  Server, ShieldCheck, Droplets, PlugZap, Clock, GitBranch,
  AlertTriangle, CloudOff, Radio,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import { useGateway } from '@/hooks/useTelecom';

interface FogData {
  ventana: { desde: string; hasta: string; dias: number; sin_nube: number; con_nube: number };
  autonomia: {
    dias_sin_nube: number;
    tramas_generadas_sin_nube: number;
    pct_del_historico_sin_nube: number;
  };
  decisiones_del_borde: Array<{ evento: string; n: number; primero: string; ultimo: string }>;
  riego_autonomo: { ciclos: number; minutos_bomba: number; dias_con_riego: number };
  recuperaciones: {
    n: number; mttr_s: number | null; peor_s: number | null; mejor_s: number | null;
    objetivo_s: number;
    detalle: Array<{ caida: string; vuelta: string; segundos: number }>;
  };
  huecos_de_datos: Array<{ desde: string; hasta: string; segundos: number }>;
}

const VENTANAS = [7, 30, 90];

function useFog(dias: number) {
  return useQuery<FogData>({
    queryKey: ['fog', dias],
    queryFn: async () => (await apiClient.get(`/api/metricas/fog?dias=${dias}`)).data,
    refetchInterval: 60_000,
  });
}

function Tarjeta({ icono: Icono, titulo, valor, unidad, pie, tono = 'blue' }: {
  icono: any; titulo: string; valor: React.ReactNode; unidad?: string;
  pie?: string; tono?: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const color = {
    blue: 'text-brand-blue', green: 'text-brand-green',
    yellow: 'text-brand-yellow', red: 'text-brand-red',
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

function Panel({ titulo, sub, children }: {
  titulo: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
      <header className="px-4 py-3 border-b border-brand-border">
        <h2 className="text-sm font-semibold text-text-primary">{titulo}</h2>
        {sub && <p className="text-[11px] text-text-muted mt-0.5 max-w-3xl">{sub}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const seg = (s: number | null) =>
  s === null ? '—' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;

export default function FogPage() {
  const [dias, setDias] = useState(30);
  const fog = useFog(dias);
  const gw = useGateway();
  const d = fog.data;

  const enLinea = gw.data?.estado === 'en linea';
  const mttrCumple = (d?.recuperaciones?.mttr_s ?? Infinity) <= (d?.recuperaciones?.objetivo_s ?? 90);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Server size={20} className="text-brand-green" />
            Gateway fog
          </h1>
          <p className="text-xs text-text-muted mt-1">
            FOG_RPI_HIERBABUENA_01 · resiliencia de borde, medida sobre datos reales
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-brand-border bg-bg-secondary p-1">
          {VENTANAS.map((v) => (
            <button key={v} onClick={() => setDias(v)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                dias === v ? 'bg-brand-green/20 text-brand-green font-medium'
                           : 'text-text-secondary hover:text-text-primary'}`}>
              {v} d
            </button>
          ))}
        </div>
      </header>

      {/* ── Estado actual ────────────────────────────────────── */}
      <div className="rounded-xl border border-brand-border bg-bg-card px-4 py-3
                      flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${enLinea ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
          <span className={enLinea ? 'text-brand-green font-medium' : 'text-brand-yellow font-medium'}>
            {gw.data?.estado ?? '—'}
          </span>
        </span>
        <span className="text-text-muted">
          última trama hace{' '}
          <span className="tabular-nums text-text-secondary">
            {gw.data ? Math.round(gw.data.silencio_s / 60) : '—'} min
          </span>
        </span>
        <span className="text-text-muted flex items-center gap-1.5">
          <CloudOff size={13} />
          ingesta en vivo:{' '}
          <span className="tabular-nums text-text-secondary">{gw.data?.ingesta_en_vivo ?? 0}</span>
        </span>
      </div>

      {/* ── La tesis, en cuatro números ──────────────────────── */}
      <Panel
        titulo="La nube estuvo apagada todo este tiempo"
        sub="Y el cultivo funcionó. Esto es lo que el proyecto llama resiliencia de borde: no que el sistema tolere la caída de la nube, sino que nunca la haya necesitado para operar."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta
            icono={CloudOff} tono="green"
            titulo="Operando sin nube"
            valor={d?.autonomia?.dias_sin_nube ?? '—'} unidad="días"
            pie={`${d?.autonomia?.pct_del_historico_sin_nube ?? 0}% del histórico se generó sin conexión a la nube`}
          />
          <Tarjeta
            icono={Droplets} tono="blue"
            titulo="Riego ejecutado solo"
            valor={d?.riego_autonomo?.ciclos ?? '—'} unidad="ciclos"
            pie={`${d?.riego_autonomo?.minutos_bomba ?? 0} min de bomba, decididos por el nodo y el gateway`}
          />
          <Tarjeta
            icono={PlugZap} tono={mttrCumple ? 'green' : 'yellow'}
            titulo="MTTR tras caída del nodo"
            valor={seg(d?.recuperaciones?.mttr_s ?? null)}
            pie={`objetivo §9: < 90 s · peor caso ${seg(d?.recuperaciones?.peor_s ?? null)} · ${d?.recuperaciones?.n ?? 0} recuperaciones`}
          />
          <Tarjeta
            icono={ShieldCheck} tono="yellow"
            titulo="Correcciones del gateway"
            valor={d?.decisiones_del_borde?.find((x) => x.evento === 'corregido')?.n ?? 0}
            pie="programas divergentes detectados y corregidos sin intervención"
          />
        </div>
      </Panel>

      {/* ── Decisiones ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          titulo="Decisiones tomadas en el borde"
          sub="Cada fila es algo que el sistema resolvió sin consultar a nadie."
        >
          {d?.decisiones_del_borde?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-brand-border">
                  <th className="text-left font-medium py-1.5">Decisión</th>
                  <th className="text-right font-medium">Veces</th>
                  <th className="text-right font-medium">Última</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.decisiones_del_borde.map((x) => (
                  <tr key={x.evento} className="border-b border-brand-border/40">
                    <td className="py-1.5">
                      <span className={
                        x.evento.startsWith('riego') ? 'text-brand-green'
                          : x.evento === 'desconectado' ? 'text-brand-red'
                          : x.evento === 'conectado' ? 'text-brand-blue'
                          : 'text-brand-yellow'
                      }>
                        {x.evento.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-right text-text-primary font-medium">{x.n}</td>
                    <td className="text-right text-text-muted">
                      {new Date(x.ultimo).toLocaleString('es', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-text-muted text-sm py-6 text-center">Sin eventos en la ventana</p>
          )}
        </Panel>

        <Panel
          titulo="Recuperaciones tras caída del nodo"
          sub="De 'desconectado' al siguiente 'conectado'. Es el MTTR real del §9, no una estimación."
        >
          {d?.recuperaciones?.detalle?.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-brand-border">
                  <th className="text-left font-medium py-1.5">Caída</th>
                  <th className="text-left font-medium">Vuelta</th>
                  <th className="text-right font-medium">Duración</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.recuperaciones.detalle.map((r, i) => (
                  <tr key={i} className="border-b border-brand-border/40">
                    <td className="py-1.5 text-text-secondary">
                      {new Date(r.caida).toLocaleString('es', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="text-text-secondary">
                      {new Date(r.vuelta).toLocaleTimeString('es', {
                        hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className={`text-right font-medium ${
                      r.segundos <= 90 ? 'text-brand-green' : 'text-brand-yellow'}`}>
                      {seg(r.segundos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-text-muted text-sm py-6 text-center">
              Sin caídas registradas en la ventana
            </p>
          )}
        </Panel>
      </div>

      {/* ── Huecos ───────────────────────────────────────────── */}
      <Panel
        titulo="Huecos en la serie de datos"
        sub="Periodos sin una sola trama. Un hueco con riego ocurriendo dentro es la prueba directa de que el nodo no necesita al gateway para seguir su programa."
      >
        {d?.huecos_de_datos?.length ? (
          <div className="space-y-1.5">
            {d.huecos_de_datos.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <AlertTriangle size={13} className="text-brand-yellow shrink-0" />
                <span className="text-text-secondary tabular-nums">
                  {new Date(h.desde).toLocaleString('es', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-text-muted">→</span>
                <span className="text-text-secondary tabular-nums">
                  {new Date(h.hasta).toLocaleTimeString('es', {
                    hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="ml-auto text-brand-yellow font-medium tabular-nums">
                  {seg(h.segundos)} sin datos
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-sm py-6 text-center">
            Serie continua, sin huecos por encima del umbral
          </p>
        )}
      </Panel>

      {/* ── Qué decide cada capa ─────────────────────────────── */}
      <Panel
        titulo="Dónde vive cada decisión"
        sub="El reparto no es una preferencia de diseño: es lo que determina si el cultivo sobrevive a una caída de red."
      >
        <div className="grid gap-3 md:grid-cols-3 text-xs">
          {[
            {
              icono: Radio, tono: 'text-brand-green', capa: 'Nodo ESP32',
              lat: '≤ 1 s',
              items: ['Cortar el llenado al detectar agua', 'Ciclos de riego día y noche',
                      'Fotoperiodo y corte por sobretemperatura', 'Enclavamientos de seguridad'],
              nota: 'Ejecuta desde NVS aunque el gateway desaparezca para siempre.',
            },
            {
              icono: Server, tono: 'text-brand-blue', capa: 'Gateway fog',
              lat: '≤ 60 s',
              items: ['Detectar caída y reponer la hora', 'Verificar y corregir el programa',
                      'Motor de reglas y alertas', 'Archivo local en SQLite'],
              nota: 'Decide sin consultar la nube y archiva antes de transmitir.',
            },
            {
              icono: GitBranch, tono: 'text-text-muted', capa: 'Nube',
              lat: '—',
              items: ['Histórico de largo plazo', 'Consulta remota y paneles',
                      'Cola de órdenes', 'Análisis de telecomunicaciones'],
              nota: 'Ninguna decisión que mantenga vivo el cultivo depende de ella.',
            },
          ].map((c) => (
            <div key={c.capa} className="rounded-lg border border-brand-border bg-bg-secondary p-3">
              <p className={`font-semibold flex items-center gap-1.5 ${c.tono}`}>
                <c.icono size={14} /> {c.capa}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                <Clock size={10} /> latencia de decisión {c.lat}
              </p>
              <ul className="mt-2 space-y-1 text-text-secondary">
                {c.items.map((i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-text-muted">·</span>{i}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-text-muted italic mt-2 leading-snug">{c.nota}</p>
            </div>
          ))}
        </div>
      </Panel>

      {d?.ventana && (
        <p className="text-[11px] text-text-muted text-center pt-2 tabular-nums">
          ventana analizada: {new Date(d.ventana.desde).toLocaleDateString('es')} →{' '}
          {new Date(d.ventana.hasta).toLocaleDateString('es')} ·{' '}
          {d.ventana.sin_nube.toLocaleString()} tramas sin nube ·{' '}
          {d.ventana.con_nube.toLocaleString()} con nube
        </p>
      )}
    </div>
  );
}
