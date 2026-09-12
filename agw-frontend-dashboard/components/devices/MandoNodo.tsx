'use client';

/**
 * Los botones de mando de un nodo.
 *
 * Es lo que antes vivía en el centro de control, extraído para que la
 * ficha de cada nodo lo tenga también. Aquí el destinatario viene
 * fijado por quien lo monta, así que no hay selector: se pulsa sobre
 * la ficha de un nodo y la orden va a ese nodo.
 *
 * Solo ofrece lo que ese nodo puede ejecutar. El de lechuga no lleva
 * válvula de tierra ni luz, y antes tenía los mismos botones que el
 * de hierbabuena: «llenar la tierra» encolaba una orden que el
 * firmware aceptaba y no hacía nada.
 *
 * El mando es asíncrono y se ve: la orden aparece «en cola» y pasa a
 * «entregada» cuando el gateway la recoge. Un «hecho» inmediato sería
 * mentir sobre la única parte donde el operador necesita saber si
 * llegó.
 */
import { useState } from 'react';
import { Send, XCircle } from 'lucide-react';
import { useSendCommand } from '@/hooks/useCommands';
import { ordenesPara, type Orden } from '@/lib/ordenes';
import type { Dispositivo } from '@/hooks/useDevices';

interface Props {
  nodo: Dispositivo;
  /** Compacto: los grupos en dos columnas y sin el detalle de cada orden. */
  compacto?: boolean;
}

export default function MandoNodo({ nodo, compacto = false }: Props) {
  const enviar = useSendCommand();
  const [ultima, setUltima] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const grupos = ordenesPara(nodo.capacidades);
  const vivo = nodo.status === 'ONLINE';

  /**
   * En serie, no en paralelo: el gateway entrega en el orden en que
   * encuentra las filas, y varias secuencias dependen de él —rearmar
   * un módulo antes de forzar su relé—.
   */
  const lanzar = async (o: Orden) => {
    const plural = o.cmd.length > 1 ? `\n\nSon ${o.cmd.length} órdenes encadenadas.` : '';
    if (o.confirmar && !window.confirm(
      `¿Enviar «${o.etiqueta}» a ${nodo.alias ?? nodo.device_uid}?${plural}`
      + '\n\nSe encola y el gateway la entrega en unos segundos.',
    )) return;
    try {
      let ultimoAviso: string | null = null;
      for (const c of o.cmd) {
        const r = await enviar.mutateAsync({ sensor_id: nodo.device_uid, comando: c, nota: o.etiqueta });
        ultimoAviso = (r as { aviso?: string | null }).aviso ?? null;
      }
      setUltima(o.etiqueta);
      setAviso(ultimoAviso);
    } catch {
      setUltima(null);
      setAviso(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${vivo ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
          <span className={vivo ? 'text-brand-green' : 'text-brand-yellow'}>
            {vivo ? 'la orden llegará en segundos' : 'sin respuesta · esperará en cola hasta que vuelva'}
          </span>
        </span>
        {ultima && (
          <span className={`flex items-center gap-1 ${aviso === 'entregado' ? 'text-brand-green' : 'text-text-secondary'}`}>
            <Send size={11} /> «{ultima}»{' '}
            {aviso === 'entregado' ? 'avisada al gateway al instante'
              : aviso === 'fallido' ? 'encolada · el gateway no contestó, la recogerá en ≤10 min'
              : 'encolada · la recogerá el sondeo (≤10 min)'}
          </span>
        )}
        {enviar.isError && (
          <span className="text-brand-red flex items-center gap-1">
            <XCircle size={11} /> No se pudo encolar
          </span>
        )}
      </div>

      <div className={`grid gap-3 ${compacto ? 'sm:grid-cols-2' : 'md:grid-cols-2'}`}>
        {grupos.map((g) => (
          <section key={g.grupo} className="rounded-lg border border-brand-border overflow-hidden">
            <header className="px-3 py-2 border-b border-brand-border bg-bg-secondary/60">
              <h3 className={`text-xs font-semibold flex items-center gap-1.5 ${g.tono}`}>
                <g.icono size={13} /> {g.grupo}
              </h3>
            </header>
            <div className="p-2 space-y-1.5">
              {g.items.map((o) => (
                <button
                  key={o.etiqueta}
                  disabled={enviar.isPending}
                  onClick={() => lanzar(o)}
                  title={compacto ? o.detalle : undefined}
                  className="w-full text-left rounded-md border border-brand-border bg-bg-secondary
                             px-2.5 py-2 transition-colors hover:border-brand-blue/50
                             hover:bg-white/[0.03] disabled:opacity-50 disabled:cursor-wait group"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-text-primary">{o.etiqueta}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {o.cmd.length > 1 && (
                        <span className="text-[10px] text-text-muted tabular-nums">×{o.cmd.length}</span>
                      )}
                      <Send size={11} className="text-text-muted group-hover:text-brand-blue" />
                    </span>
                  </span>
                  {!compacto && (
                    <span className="block text-[11px] text-text-muted mt-0.5 leading-snug">
                      {o.detalle}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
