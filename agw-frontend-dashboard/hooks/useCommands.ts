/**
 * Órdenes hacia el nodo.
 *
 * La página salía vacía por lo mismo que la de alertas: el hook leía
 * `data.data` y la API devuelve `{ comandos: [...] }`.
 *
 * El mando es asíncrono por necesidad. La nube no alcanza al ESP32, que
 * vive en la red aislada del cultivo detrás del NAT del gateway; el
 * único que puede hablarle es la Raspberry. La web encola aquí, el
 * gateway consulta las pendientes, las entrega por MQTT y confirma.
 * Por eso una orden recién creada aparece como «pendiente» y tarda unos
 * segundos en pasar a «entregada»: no es lentitud de la interfaz, es el
 * viaje real.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { Command, EstadoComando, SendCommandPayload } from '@/types/command';

export const ESTADO_ETIQUETA: Record<EstadoComando, string> = {
  pendiente: 'En cola',
  entregado: 'Entregada al nodo',
  fallido:   'Fallida',
  cancelado: 'Cancelada',
};

export const ESTADO_COLOR: Record<EstadoComando, string> = {
  pendiente: 'text-brand-yellow',
  entregado: 'text-brand-green',
  fallido:   'text-brand-red',
  cancelado: 'text-text-muted',
};

/** Nombre legible de la orden a partir del JSON del firmware. */
export function describirComando(cmd?: Record<string, unknown>): string {
  if (!cmd) return '—';
  const nombre = String(cmd.cmd ?? '');
  switch (nombre) {
    case 'luz':
      return cmd.encendida ? 'Encender la luz' : 'Apagar la luz por hoy';
    case 'set_riego':
      return cmd.encendido ? 'Riego manual: abrir' : 'Riego manual: cerrar';
    case 'llenar_tierra':
      return cmd.prueba ? 'Llenar la tierra (prueba)' : 'Llenar la tierra ahora';
    case 'medir_ec':      return 'Medir conductividad';
    case 'get_status':    return 'Pedir estado al nodo';
    case 'reset':         return 'Reiniciar el nodo';
    case 'salidas_off':   return 'Bajar todas las salidas';
    case 'set_programa':  return 'Cambiar el programa de cultivo';
    case 'set_modulo':    return `Módulo ${cmd.modulo}: ${cmd.activo ? 'on' : 'off'}`;
    case 'set_salida':    return `Relé ${cmd.salida}: ${cmd.activo ? 'on' : 'off'}`;
    default:              return nombre || 'Orden sin nombre';
  }
}

export function useCommands(limite = 50) {
  return useQuery<Command[]>({
    queryKey: ['commands', limite],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/iot/commands', {
        params: { limite },
      });
      const filas: Command[] = data?.comandos ?? [];
      return filas.map((c) => ({
        ...c,
        id: String(c.id),
        created_at: c.creado_en ?? c.created_at,
        command_type: describirComando(c.comando),
        status: (c.estado === 'entregado' ? 'SENT'
          : c.estado === 'fallido' ? 'FAILED'
          : c.estado === 'cancelado' ? 'EXPIRED'
          : 'PENDING'),
      }));
    },
    // Una orden encolada cambia de estado por su cuenta cuando el
    // gateway la recoge. Sin refresco, la interfaz la dejaría en «en
    // cola» para siempre aunque el nodo ya la hubiera ejecutado.
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

export function useSendCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendCommandPayload) => {
      const cuerpo = {
        sensor_id: payload.sensor_id ?? payload.device_id ?? 'IoT-node-26.001',
        comando: payload.comando
          ?? { cmd: payload.command_type, ...(payload.payload ?? {}) },
        nota: payload.nota,
      };
      const { data } = await apiClient.post('/api/iot/commands', cuerpo);
      return data as Command;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commands'] });
    },
  });
}
