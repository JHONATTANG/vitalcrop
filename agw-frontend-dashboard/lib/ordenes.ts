/**
 * Catálogo de órdenes hacia un nodo.
 *
 * Vivía dentro de la página de control. Se saca aquí porque la ficha de
 * cada nodo también ofrece mando, y dos copias del catálogo son dos
 * catálogos que divergen.
 *
 * Solo las órdenes que el firmware entiende de verdad (contrato en
 * config.h) y que son seguras desde una web. Las de calibración quedan
 * fuera a propósito: exigen tener la sonda en la mano.
 *
 * POR QUÉ ALGUNAS SON UNA SECUENCIA
 *
 * El firmware apaga los automatismos en cuanto alguien toca un relé a
 * mano —`set_salida` pone riego_hidro, riego_tierra y ambiente a
 * false— para que dos rutinas no se peleen por la misma bomba. Deja
 * dos trampas que se descubrieron usándolo: encender la luz de noche
 * apagaba los dos riegos sin avisar, y con riego_hidro apagado su
 * tarea cierra los relés justo después de que el riego manual los
 * abra. Cada orden de aquí manda la secuencia que deja el nodo
 * coherente por sí sola.
 *
 * `requiere` es la novedad: el módulo que el nodo tiene que tener para
 * que la orden tenga sentido. Un nodo sin válvula de tierra no puede
 * llenarla, y ofrecérselo era mentir.
 */
import {
  Lightbulb, Droplets, FlaskConical, RotateCcw, Power,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Modulo } from '@/types/device';

export interface Orden {
  etiqueta: string;
  detalle: string;
  cmd: readonly Record<string, unknown>[];
  confirmar?: boolean;
  /** Módulo que el nodo debe tener. Sin él, la orden no se ofrece. */
  requiere?: Modulo;
}

export interface GrupoOrdenes {
  grupo: string;
  icono: LucideIcon;
  tono: string;
  items: readonly Orden[];
}

export const ORDENES: readonly GrupoOrdenes[] = [
  {
    grupo: 'Iluminación',
    icono: Lightbulb,
    tono: 'text-brand-yellow',
    items: [
      {
        etiqueta: 'Encender la luz ahora',
        detalle: 'Fuerza la luz fuera del fotoperiodo y pausa el automatismo de ambiente',
        requiere: 'ambiente',
        cmd: [
          { cmd: 'set_salida', salida: 'ambiente', activo: true },
          { cmd: 'set_modulo', modulo: 'riego_hidro', activo: true },
          { cmd: 'set_modulo', modulo: 'riego_tierra', activo: true },
        ],
        confirmar: true,
      },
      {
        etiqueta: 'Devolver la luz al horario',
        detalle: 'Reactiva el automatismo: de noche apaga, a las 06:00 enciende',
        requiere: 'ambiente',
        cmd: [{ cmd: 'set_modulo', modulo: 'ambiente', activo: true }],
      },
      {
        etiqueta: 'Apagar la luz por hoy',
        detalle: 'Veto de una jornada; caduca a las 18:00',
        requiere: 'ambiente',
        cmd: [{ cmd: 'luz', encendida: false }],
      },
      {
        etiqueta: 'Levantar el veto de hoy',
        detalle: 'Deshace el apagado manual. De noche no enciende',
        requiere: 'ambiente',
        cmd: [{ cmd: 'luz', encendida: true }],
      },
    ],
  },
  {
    grupo: 'Riego',
    icono: Droplets,
    tono: 'text-brand-blue',
    items: [
      {
        etiqueta: 'Riego manual: abrir',
        detalle: 'Bomba y válvula de hidroponía. El ciclo automático se aparta',
        requiere: 'riego_hidro',
        cmd: [
          { cmd: 'set_modulo', modulo: 'riego_hidro', activo: true },
          { cmd: 'set_riego', encendido: true },
        ],
        confirmar: true,
      },
      {
        etiqueta: 'Riego manual: cerrar',
        detalle: 'Cierra y devuelve el control al ciclo automático',
        requiere: 'riego_hidro',
        cmd: [{ cmd: 'set_riego', encendido: false }],
      },
      {
        etiqueta: 'Llenar la tierra ahora',
        detalle: 'Cuenta como el llenado del ciclo y reprograma a 8 días',
        requiere: 'riego_tierra',
        cmd: [{ cmd: 'llenar_tierra' }],
        confirmar: true,
      },
      {
        etiqueta: 'Llenar la tierra en prueba',
        detalle: 'Llena sin mover la fecha del próximo llenado',
        requiere: 'riego_tierra',
        cmd: [{ cmd: 'llenar_tierra', prueba: true }],
        confirmar: true,
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
        detalle: 'Lectura puntual de la sonda TDS',
        // La sonda es un sensor, no un módulo; se filtra aparte.
        cmd: [{ cmd: 'medir_ec' }],
      },
      {
        etiqueta: 'Pedir estado completo',
        detalle: 'El nodo publica su estado íntegro en el siguiente instante',
        cmd: [{ cmd: 'get_status' }],
      },
    ],
  },
  {
    grupo: 'Volver al automático',
    icono: RotateCcw,
    tono: 'text-brand-green',
    items: [
      {
        etiqueta: 'Restaurar todos los automatismos',
        detalle: 'Cierra el riego manual y reactiva todos los módulos del nodo',
        cmd: [
          { cmd: 'set_riego', encendido: false },
          { cmd: 'set_modulo', modulo: 'riego_hidro', activo: true },
          { cmd: 'set_modulo', modulo: 'riego_tierra', activo: true },
          { cmd: 'set_modulo', modulo: 'ambiente', activo: true },
        ],
      },
      {
        etiqueta: 'Módulos a valores de fábrica',
        detalle: 'Devuelve los módulos a producción. Útil tras reflashear',
        cmd: [{ cmd: 'reset_modulos' }],
        confirmar: true,
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
        detalle: 'Parada de emergencia. Se sale con «Restaurar todos los automatismos»',
        cmd: [{ cmd: 'salidas_off' }],
        confirmar: true,
      },
      {
        etiqueta: 'Reiniciar el nodo',
        detalle: 'El programa sobrevive en memoria no volátil',
        cmd: [{ cmd: 'reset' }],
        confirmar: true,
      },
    ],
  },
];

/**
 * Las órdenes que un nodo concreto puede ejecutar.
 *
 * Sin `capacidades` (un nodo que la API aún no describe) se ofrece
 * todo, como antes: mejor un botón de más que un nodo sin mando.
 */
export function ordenesPara(cap?: {
  modulos: readonly string[];
  sensores: readonly string[];
}): GrupoOrdenes[] {
  if (!cap) return [...ORDENES];
  return ORDENES
    .map((g) => ({
      ...g,
      items: g.items.filter((o) => {
        if (o.requiere && !cap.modulos.includes(o.requiere)) return false;
        if (o.cmd[0]?.cmd === 'medir_ec' && !cap.sensores.includes('tds')) return false;
        return true;
      }),
    }))
    .filter((g) => g.items.length > 0);
}
