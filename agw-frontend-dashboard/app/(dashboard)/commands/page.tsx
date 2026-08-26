'use client';

/**
 * Centro de control.
 *
 * Salía vacía por un desajuste de contrato —el hook leía `data.data` y
 * la API devuelve `{ comandos }`— y los controles que había enviaban
 * órdenes con nombres que el firmware no entiende.
 *
 * EL MANDO ES ASÍNCRONO, Y ESO SE VE
 *
 * La nube no alcanza al ESP32: vive en la red aislada del cultivo,
 * detrás del NAT del gateway. El único que puede hablarle es la
 * Raspberry. Así que pulsar un botón aquí no manda nada al nodo —
 * encola una fila, el gateway la recoge en su siguiente vuelta y la
 * entrega por MQTT.
 *
 * La interfaz no disimula ese viaje: la orden aparece «en cola» y pasa
 * a «entregada» cuando el gateway acusa recibo, unos segundos después.
 * Esconderlo con un falso «hecho» inmediato sería mentir sobre la única
 * parte del sistema donde el operador necesita saber si su orden llegó.
 */
import React, { useState } from 'react';
import {
  Terminal, Lightbulb, Droplets, FlaskConical, RefreshCw, Power,
  Send, Clock, CheckCircle2, XCircle, AlertCircle, Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import PageContainer from '@/components/layout/PageContainer';
import {
  useCommands, useSendCommand, describirComando,
} from '@/hooks/useCommands';
import { useDevices } from '@/hooks/useDevices';
import type { EstadoComando } from '@/types/command';

/**
 * Órdenes ofrecidas.
 *
 * Solo las que el firmware entiende de verdad (contrato en config.h) y
 * que son seguras de disparar desde una web. Las de calibración se
 * quedan fuera a propósito: exigen tener la sonda en la mano, al aire o
 * en solución patrón, y lanzarlas a ciegas desde el navegador
 * estropearía la referencia guardada en la memoria del nodo.
 */
const ORDENES = [
  {
    grupo: 'Iluminación',
    icono: Lightbulb,
    tono: 'text-brand-yellow',
    items: [
      {
        etiqueta: 'Apagar la luz por hoy',
        detalle: 'Caduca sola a las 18:00 y mañana enciende en su horario',
        cmd: { cmd: 'luz', encendida: false },
      },
      {
        etiqueta: 'Levantar el apagado',
        detalle: 'Devuelve la luz al control del fotoperiodo ahora mismo',
        cmd: { cmd: 'luz', encendida: true },
      },
    ],
  },
  {
    grupo: 'Riego',
    icono: Droplets,
    tono: 'text-brand-blue',
    items: [
      {
        etiqueta: 'Llenar la tierra ahora',
        detalle: 'Cuenta como el llenado del ciclo y reprograma los 10 días',
        cmd: { cmd: 'llenar_tierra' },
        confirmar: true,
      },
      {
        etiqueta: 'Llenar la tierra en prueba',
        detalle: 'Llena sin tocar el calendario del ciclo',
        cmd: { cmd: 'llenar_tierra', prueba: true },
        confirmar: true,
      },
      {
        etiqueta: 'Riego manual: abrir',
        detalle: 'Bomba y válvula de hidroponía. Desactiva los automatismos',
        cmd: { cmd: 'set_riego', encendido: true },
        confirmar: true,
      },
      {
        etiqueta: 'Riego manual: cerrar',
        detalle: 'Cierra el riego manual',
        cmd: { cmd: 'set_riego', encendido: false },
      },
    ],
  },
  {
    grupo: 'Medición',
    icono: FlaskConical,
    tono: 'text-brand-green',
    items: [
      {
        etiqueta: 'Medir conductividad',
        detalle: 'Lectura puntual de la sonda TDS, fuera de la cadencia',
        cmd: { cmd: 'medir_ec' },
      },
      {
        etiqueta: 'Pedir estado completo',
        detalle: 'El nodo publica su estado íntegro en el siguiente instante',
        cmd: { cmd: 'get_status' },
      },
    ],
  },
  {
    grupo: 'Mantenimiento',
    icono: Power,
    tono: 'text-brand-red',
    items: [
      {
        etiqueta: 'Bajar todas las salidas',
        detalle: 'Corta relés y desactiva automatismos. Parada de emergencia',
        cmd: { cmd: 'salidas_off' },
        confirmar: true,
      },
      {
        etiqueta: 'Reiniciar el nodo',
        detalle: 'El programa sobrevive: vive en memoria no volátil',
        cmd: { cmd: 'reset' },
        confirmar: true,
      },
    ],
  },
] as const;

const ICONO_ESTADO: Record<EstadoComando, LucideIcon> = {
  pendiente: Clock,
  entregado: CheckCircle2,
  fallido:   XCircle,
  cancelado: AlertCircle,
};

const TEXTO_ESTADO: Record<EstadoComando, string> = {
  pendiente: 'En cola',
  entregado: 'Entregada al nodo',
  fallido:   'Fallida',
  cancelado: 'Cancelada',
};

const COLOR_ESTADO: Record<EstadoComando, string> = {
  pendiente: 'text-brand-yellow',
  entregado: 'text-brand-green',
  fallido:   'text-brand-red',
  cancelado: 'text-text-muted',
};

export default function CommandsPage() {
  const dispositivos = useDevices();
  const historial = useCommands(60);
  const enviar = useSendCommand();

  const nodos = (dispositivos.data ?? []).filter((d) => d.device_type !== 'GATEWAY');
  const [destino, setDestino] = useState<string | null>(null);
  const nodo = destino ?? nodos[0]?.device_uid ?? 'IoT-node-26.001';
  const nodoVivo = nodos.find((n) => n.device_uid === nodo)?.status === 'ONLINE';

  const [ultima, setUltima] = useState<string | null>(null);

  const lanzar = async (
    etiqueta: string,
    cmd: Record<string, unknown>,
    confirmar?: boolean,
  ) => {
    if (confirmar && !window.confirm(
      `¿Enviar «${etiqueta}» al nodo ${nodo}?\n\nLa orden se encola y el gateway la entrega en unos segundos.`
    )) return;

    try {
      await enviar.mutateAsync({ sensor_id: nodo, comando: cmd, nota: etiqueta });
      setUltima(etiqueta);
    } catch {
      setUltima(null);
    }
  };

  const pendientes = historial.data?.filter((c) => c.estado === 'pendiente').length ?? 0;

  return (
    <PageContainer ancho="amplio">
      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Terminal size={20} className="text-brand-blue" />
              Centro de control
            </h1>
            <p className="text-xs text-text-muted mt-1 max-w-2xl leading-relaxed">
              Las órdenes se encolan en la nube y las recoge el gateway, que es el único
              que alcanza al nodo. Por eso aparecen «en cola» antes de entregarse.
            </p>
          </div>

          {nodos.length > 1 && (
            <select
              value={nodo}
              onChange={(e) => setDestino(e.target.value)}
              className="rounded-lg border border-brand-border bg-bg-secondary px-3 py-1.5
                         text-xs text-text-primary"
            >
              {nodos.map((n) => (
                <option key={n.device_uid} value={n.device_uid}>{n.alias}</option>
              ))}
            </select>
          )}
        </header>

        {/* Estado del destinatario: una orden a un nodo caído se encola
            igual y se entrega cuando vuelva, pero conviene saberlo antes
            de pulsar y no después. */}
        <div className="rounded-xl border border-brand-border bg-bg-card px-4 py-3
                        flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${nodoVivo ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
            <span className="text-text-secondary">Destinatario</span>
            <span className="font-mono text-text-primary">{nodo}</span>
          </span>
          <span className={nodoVivo ? 'text-brand-green' : 'text-brand-yellow'}>
            {nodoVivo
              ? 'en línea · la orden llegará en segundos'
              : 'sin respuesta · la orden esperará en la cola hasta que vuelva'}
          </span>
          {pendientes > 0 && (
            <span className="text-brand-yellow flex items-center gap-1.5 ml-auto">
              <Clock size={12} /> {pendientes} orden{pendientes === 1 ? '' : 'es'} sin entregar
            </span>
          )}
        </div>

        {ultima && (
          <div className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-4 py-2.5
                          text-xs text-brand-green flex items-center gap-2">
            <Send size={13} />
            «{ultima}» encolada. Aparecerá abajo como entregada cuando el gateway la recoja.
          </div>
        )}

        {enviar.isError && (
          <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-4 py-2.5
                          text-xs text-brand-red flex items-center gap-2">
            <XCircle size={13} /> No se pudo encolar la orden. Revisa la conexión con la API.
          </div>
        )}

        {/* ── Órdenes ────────────────────────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2">
          {ORDENES.map((g) => (
            <section key={g.grupo}
              className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
              <header className="px-4 py-3 border-b border-brand-border">
                <h2 className={`text-sm font-semibold flex items-center gap-2 ${g.tono}`}>
                  <g.icono size={15} /> {g.grupo}
                </h2>
              </header>
              <div className="p-3 space-y-2">
                {g.items.map((o) => (
                  <button
                    key={o.etiqueta}
                    disabled={enviar.isPending}
                    onClick={() => lanzar(o.etiqueta, o.cmd as Record<string, unknown>,
                      (o as { confirmar?: boolean }).confirmar)}
                    className="w-full text-left rounded-lg border border-brand-border
                               bg-bg-secondary px-3 py-2.5 transition-colors
                               hover:border-brand-blue/50 hover:bg-white/[0.03]
                               disabled:opacity-50 disabled:cursor-wait group"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-text-primary">{o.etiqueta}</span>
                      <Send size={12} className="text-text-muted group-hover:text-brand-blue shrink-0" />
                    </span>
                    <span className="block text-[11px] text-text-muted mt-0.5 leading-snug">
                      {o.detalle}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* ── Historial ──────────────────────────────────────── */}
        <section className="rounded-xl border border-brand-border bg-bg-card overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <div>
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Waves size={14} className="text-text-muted" /> Historial de órdenes
              </h2>
              <p className="text-[11px] text-text-muted mt-1">
                Cada fila guarda cuándo se pidió y cuándo llegó. Tener las dos marcas es lo que
                distingue «lo pedí» de «el nodo lo recibió».
              </p>
            </div>
            <button
              onClick={() => historial.refetch()}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary
                         hover:bg-white/5 transition-colors"
              title="Actualizar"
            >
              <RefreshCw size={14} className={historial.isFetching ? 'animate-spin' : ''} />
            </button>
          </header>

          <div className="p-3">
            {historial.isLoading ? (
              <p className="text-text-muted text-sm py-8 text-center">Cargando…</p>
            ) : !historial.data?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
                <Terminal size={32} className="opacity-30" />
                <p className="text-sm">Todavía no se ha enviado ninguna orden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[38rem]">
                  <thead>
                    <tr className="text-text-muted border-b border-brand-border">
                      <th className="text-left font-medium py-2">Orden</th>
                      <th className="text-left font-medium">Destino</th>
                      <th className="text-left font-medium">Pedida</th>
                      <th className="text-left font-medium">Entregada</th>
                      <th className="text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.data.map((c) => {
                      const est = (c.estado ?? 'pendiente') as EstadoComando;
                      const Icono = ICONO_ESTADO[est];
                      const demora = c.entregado_en && c.creado_en
                        ? (new Date(c.entregado_en).getTime() - new Date(c.creado_en).getTime()) / 1000
                        : null;
                      return (
                        <tr key={c.id} className="border-b border-brand-border/40">
                          <td className="py-2">
                            <span className="text-text-primary">{describirComando(c.comando)}</span>
                            <span className="block text-[10px] text-text-muted font-mono">
                              {JSON.stringify(c.comando)}
                            </span>
                          </td>
                          <td className="text-text-secondary font-mono text-[11px]">{c.sensor_id}</td>
                          <td className="text-text-muted tabular-nums whitespace-nowrap">
                            {c.creado_en && new Date(c.creado_en).toLocaleString('es', {
                              day: '2-digit', month: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </td>
                          <td className="text-text-muted tabular-nums whitespace-nowrap">
                            {c.entregado_en
                              ? <>
                                  {new Date(c.entregado_en).toLocaleTimeString('es', {
                                    hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  {demora !== null && (
                                    <span className="text-text-muted/70"> · {demora.toFixed(1)} s</span>
                                  )}
                                </>
                              : '—'}
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
