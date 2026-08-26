/**
 * Alertas generadas por el motor de reglas del gateway.
 *
 * Se generan en la Raspberry, no en la nube: las reglas corren en el
 * borde para que sigan funcionando sin internet. La nube solo las
 * consulta.
 *
 * Los campos que los componentes leen sin comprobar van obligatorios.
 * Ponerlos opcionales "por si acaso" solo mueve el error del tipo al
 * componente, que es donde peor se ve.
 */

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  created_at: string;
  /** Tipo de evento: ec_baja, temp_alta, desconectado... */
  alert_type: string;
  severity: AlertSeverity;
  message: string;
  /** El backend no lo sirve todavia; la UI lo usa para marcar leidas. */
  is_read: boolean;

  ts?: string;
  node_id?: string;
  sensor_id?: string;
  tipo?: string;
  detalle?: Record<string, unknown>;
  sensor_data?: Record<string, unknown> | string;
}
