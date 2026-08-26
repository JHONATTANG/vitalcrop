/**
 * Alertas y eventos del nodo.
 *
 * La página salía vacía por un desajuste de contrato, no por falta de
 * datos: el hook leía `data.data` y la API devuelve
 * `{ resumen, alertas }`. Había 270 eventos guardados todo el tiempo.
 *
 * Las genera el motor de reglas de la Raspberry, no la nube: las reglas
 * corren en el borde para seguir funcionando sin internet. Aquí solo se
 * consultan.
 */
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api';
import type { Alert, AlertSeverity } from '@/types/alert';

export interface AlertaCruda {
  ts: string;
  sensor_id: string;
  tipo: string;
  detalle: Record<string, unknown> | null;
}

export interface ResumenAlerta {
  tipo: string;
  n: number;
  ultimo: string;
}

/**
 * Severidad por tipo de evento.
 *
 * La tabla `node_eventos` no guarda severidad: guarda qué pasó. Que una
 * desconexión sea grave y una reconexión no es una lectura del operador,
 * y vive aquí para que la UI no tenga que repetirla en cada sitio.
 */
const SEVERIDAD: Record<string, AlertSeverity> = {
  desconectado:            'CRITICAL',
  nodo_sin_responder:      'CRITICAL',
  programa_discrepante:    'WARNING',
  reinicio_detectado:      'WARNING',
  temp_alta:               'WARNING',
  ec_baja:                 'WARNING',
  ec_alta:                 'WARNING',
  conectado:               'INFO',
  hora_repuesta:           'INFO',
  programa_repuesto:       'INFO',
};

/** Etiquetas legibles. El nombre técnico se conserva como detalle. */
const ETIQUETA: Record<string, string> = {
  desconectado:         'Nodo desconectado del punto de acceso',
  conectado:            'Nodo reasociado al punto de acceso',
  programa_discrepante: 'El nodo ejecutaba un programa distinto al del gateway',
  programa_repuesto:    'Programa reenviado al nodo',
  hora_repuesta:        'Reloj del nodo corregido',
  reinicio_detectado:   'Reinicio del nodo detectado por retroceso de uptime',
};

export function severidadDe(tipo: string): AlertSeverity {
  return SEVERIDAD[tipo] ?? 'INFO';
}

export function etiquetaDe(tipo: string): string {
  return ETIQUETA[tipo] ?? tipo.replace(/_/g, ' ');
}

export interface AlertasRespuesta {
  resumen: ResumenAlerta[];
  alertas: Alert[];
}

export function useAlerts(dias = 7, limite = 200) {
  return useQuery<AlertasRespuesta>({
    queryKey: ['alerts', { dias, limite }],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/iot/alerts', {
        params: { dias, limite },
      });

      const crudas: AlertaCruda[] = data?.alertas ?? [];
      const alertas: Alert[] = crudas.map((a, i) => ({
        // La tabla no tiene clave primaria expuesta; el par instante +
        // tipo identifica la fila sin ambigüedad y sobrevive a un
        // reordenamiento, cosa que el índice del array no haría.
        id: `${a.ts}-${a.tipo}-${i}`,
        created_at: a.ts,
        ts: a.ts,
        alert_type: a.tipo,
        tipo: a.tipo,
        severity: severidadDe(a.tipo),
        message: etiquetaDe(a.tipo),
        // El backend no lleva registro de lectura todavía. Marcarlas
        // como no leídas sería inventar un estado que nadie guarda.
        is_read: true,
        sensor_id: a.sensor_id,
        detalle: a.detalle ?? undefined,
      }));

      return { resumen: data?.resumen ?? [], alertas };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
