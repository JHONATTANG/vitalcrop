/**
 * Tipos de dispositivo.
 *
 * `IoTDevice` describia solo cinco campos, pero los componentes usaban
 * ademas location, firmware_version y description. En `next dev` no se
 * nota —SWC no verifica tipos— pero `next build` corre tsc y falla, asi
 * que el proyecto no podia desplegarse en Vercel.
 *
 * Los campos añadidos son opcionales a proposito: la API no siempre los
 * devuelve, y marcarlos como obligatorios cambiaria el error de sitio en
 * vez de resolverlo.
 */

/**
 * Estados que pinta la UI. La lista tiene que ser EXACTA: los
 * componentes construyen un Record<DeviceStatus, ...> y TypeScript
 * exige una entrada por miembro. Un valor de mas aqui rompe el build
 * aunque nadie lo use.
 */
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE';

/** TIERRA e HIDROPONIA son los que acepta el CHECK de edge_nodes. */
export type DeviceType = 'TIERRA' | 'HIDROPONIA' | string;

export interface IoTDevice {
  id: string;
  device_uid: string;
  device_type: DeviceType;
  status: DeviceStatus;
  last_seen?: string;

  alias?: string;
  description?: string;
  location?: string;
  firmware_version?: string;
  gateway_id?: string;
  sensor_id?: string;
  created_at?: string;

  /** Solo nodos. `true` = el firmware genera los valores de los sensores. */
  simulado?: boolean;
  /** Solo nodos. La especie del cultivo que lleva: hierbabuena, lechuga… */
  especie?: string | null;
  /** Solo gateway. Cuántos nodos cuelgan de él. */
  nodos?: number;
  /**
   * Solo nodos. Lo que ese nodo tiene conectado de verdad. Decide qué
   * lecturas se enseñan, qué órdenes se ofrecen y qué dibuja el mapa:
   * un nodo sin válvula de tierra no puede ofrecer «llenar la tierra».
   */
  capacidades?: {
    sensores: Sensor[];
    actuadores: Actuador[];
    modulos: Modulo[];
  };
}

export type Sensor   = 'hdc1080' | 'tds' | 'nivel';
export type Actuador = 'bomba' | 'valvula_hidro' | 'valvula_tierra' | 'luz';
export type Modulo   = 'riego_hidro' | 'riego_tierra' | 'ambiente';
