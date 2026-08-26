/**
 * Ordenes hacia el nodo.
 *
 * El mando es asincrono por necesidad, no por comodidad: la nube no
 * alcanza al ESP32, que vive en la red aislada del cultivo tras el NAT
 * del gateway. La web encola, la Raspberry consulta las pendientes, las
 * entrega por MQTT y confirma.
 */

/**
 * Dos vocabularios conviven a proposito: el de la API nueva, en
 * minusculas y castellano, y el que ya pintaba la UI. Unificarlos exige
 * tocar la tabla `comandos` y el historial a la vez; hasta entonces el
 * tipo admite los dos y nadie se rompe.
 */
export type CommandStatus =
  'PENDING' | 'SENT' | 'EXECUTED' | 'FAILED' | 'EXPIRED';

/** Los que usa la tabla `comandos` de la API. Se traducen en el hook. */
export type EstadoComando =
  'pendiente' | 'entregado' | 'fallido' | 'cancelado';

/** Orden que entiende el firmware. Ver el contrato en config.h. */
export type CommandType =
  | 'set_riego' | 'set_modulo' | 'set_programa' | 'luz'
  | 'llenar_tierra' | 'medir_ec' | 'cal_cero' | 'cal_tds'
  | 'set_salida' | 'salidas_off' | 'get_status' | 'reset'
  | string;

export interface Command {
  id: string;
  created_at: string;
  /** Nombre legible de la orden, para el historial. */
  command_type: string;
  status: CommandStatus;

  creado_en?: string;
  sensor_id?: string;
  /** JSON tal como lo entiende el firmware: {"cmd":"luz","encendida":false} */
  comando?: Record<string, unknown>;
  estado?: EstadoComando;
  entregado_en?: string | null;
  resultado?: string | null;
  nota?: string | null;
  creado_por?: string | null;
}

export interface ActuatorState {
  bomba?: boolean;
  valvula_hidro?: boolean;
  valvula_tierra?: boolean;
  luz?: boolean;
}

/** Alias historico de Command; lo importan los hooks. */
export type DeviceCommand = Command;

/** Cuerpo de POST /api/iot/commands. */
export interface SendCommandPayload {
  /**
   * Todo opcional porque conviven dos formas de llamar: la nueva
   * (sensor_id + comando, el JSON del firmware) y la que ya usaban los
   * controles (device_id + command_type). El hook decide cual manda.
   */
  sensor_id?: string;
  comando?: Record<string, unknown>;
  nota?: string;
  device_id?: string;
  command_type?: CommandType;
  payload?: Record<string, unknown>;
}
