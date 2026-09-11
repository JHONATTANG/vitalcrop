/**
 * Fichas de plantas para cultivo en ambiente controlado.
 *
 * Las cinco variables de cada ficha son las que un cultivador necesita
 * para decidir si la planta le sirve y con qué sistema:
 *
 *   temperatura  el rango en que crece sin estrés; fuera de él no muere,
 *                pero se espiga, se alarga o para.
 *   pH           de la solución nutritiva. Fuera de 5,5–6,5 la mayoría de
 *                nutrientes deja de estar disponible aunque esté ahí.
 *   EC           conductividad de la solución en mS/cm: cuánto
 *                fertilizante lleva el agua. Hojas bajas, frutos altos.
 *   luz          horas de fotoperiodo. Más no siempre es mejor: la
 *                albahaca florece con días largos y pierde hoja.
 *   ciclo        de siembra o trasplante a primera cosecha.
 *
 * Los valores son los rangos de manejo habituales en hidroponía para
 * cada especie; no son umbrales de alerta.
 */
import type { Piso } from './zonas';

export interface Planta {
  id: string;
  nombre: string;
  cientifico: string;
  familia: string;
  piso: Piso[];
  temperatura: [number, number];
  ph: [number, number];
  ec: [number, number];
  luz: [number, number];
  ciclo: string;
  sistemas: string[];
  uso: string;
  consejo: string;
  /** La de VitalCrop. */
  vitalcrop?: boolean;
  imagen: string;
}

export const PLANTAS: Planta[] = [
  {
    id: 'hierbabuena', nombre: 'Hierbabuena', cientifico: 'Mentha spicata', familia: 'Lamiáceas',
    imagen: '/img/vc/mata-1.jpg',
    piso: ['frio', 'templado'], temperatura: [18, 25], ph: [5.5, 6.5], ec: [1.4, 2.0], luz: [12, 14],
    ciclo: '35–45 días a primer corte; rebrota cada 30', sistemas: ['Raíz flotante', 'NFT', 'Sustrato'],
    uso: 'Aromática culinaria y de infusión. Colombia la exporta fresca.',
    consejo: 'Se propaga por esqueje, no por semilla: un tallo de 10 cm con dos nudos enraíza en agua en una semana. Cortar por encima del segundo nudo para que rebrote doble.',
    vitalcrop: true,
  },
  {
    id: 'lechuga', nombre: 'Lechuga', cientifico: 'Lactuca sativa', familia: 'Asteráceas',
    imagen: '/img/plantas/lechuga.jpg',
    piso: ['frio', 'templado'], temperatura: [15, 22], ph: [5.8, 6.2], ec: [0.8, 1.4], luz: [12, 16],
    ciclo: '35–50 días desde el trasplante', sistemas: ['Raíz flotante', 'NFT'],
    uso: 'La hortaliza hidropónica por excelencia: rápida, ligera y de raíz pequeña.',
    consejo: 'Por encima de 24 °C se espiga y amarga. En clima cálido, sombra al 30 % y solución más fría que el aire.',
  },
  {
    id: 'albahaca', nombre: 'Albahaca', cientifico: 'Ocimum basilicum', familia: 'Lamiáceas',
    imagen: '/img/plantas/albahaca.jpg',
    piso: ['templado', 'calido'], temperatura: [20, 28], ph: [5.5, 6.5], ec: [1.0, 1.6], luz: [14, 16],
    ciclo: '40–60 días a primer corte', sistemas: ['NFT', 'Sustrato', 'Raíz flotante'],
    uso: 'Aromática de mayor valor por kilo entre las de exportación.',
    consejo: 'Despuntar la flor en cuanto asome: una vez florece, la hoja pierde aceite y sabor. Sensible al frío por debajo de 12 °C.',
  },
  {
    id: 'espinaca', nombre: 'Espinaca', cientifico: 'Spinacia oleracea', familia: 'Amarantáceas',
    imagen: '/img/plantas/espinaca.jpg',
    piso: ['frio', 'paramo'], temperatura: [12, 20], ph: [6.0, 7.0], ec: [1.8, 2.3], luz: [10, 14],
    ciclo: '40–50 días', sistemas: ['Raíz flotante', 'Sustrato'],
    uso: 'Hoja verde de clima frío; acumula nitratos si el nitrógeno va alto.',
    consejo: 'Días largos y calor la hacen florecer. Es la que mejor aguanta el frío de la Sabana sin cubierta.',
  },
  {
    id: 'fresa', nombre: 'Fresa', cientifico: 'Fragaria × ananassa', familia: 'Rosáceas',
    imagen: '/img/plantas/fresa.jpg',
    piso: ['frio'], temperatura: [15, 22], ph: [5.5, 6.2], ec: [1.4, 1.8], luz: [12, 14],
    ciclo: 'Perenne; primera cosecha a los 60–90 días', sistemas: ['Sustrato', 'NFT vertical'],
    uso: 'Fruto de clima frío. Sibaté y Pamplona la producen en campo; en invernadero, en bolsa colgada.',
    consejo: 'Necesita polinización: sin abejas ni viento hay que pasar un pincel por la flor o el fruto sale deforme.',
  },
  {
    id: 'tomate', nombre: 'Tomate', cientifico: 'Solanum lycopersicum', familia: 'Solanáceas',
    imagen: '/img/plantas/tomate.jpg',
    piso: ['templado', 'calido'], temperatura: [20, 27], ph: [5.8, 6.5], ec: [2.0, 3.5], luz: [14, 16],
    ciclo: '90–120 días a primera cosecha; produce 6 meses', sistemas: ['Sustrato con goteo', 'NFT'],
    uso: 'Fruto exigente: el que más nutrición y más luz pide de esta lista.',
    consejo: 'La EC sube con la carga de fruto: 2,0 en crecimiento, hasta 3,5 en plena producción. El calcio bajo se ve como una mancha negra en la punta del fruto.',
  },
  {
    id: 'cilantro', nombre: 'Cilantro', cientifico: 'Coriandrum sativum', familia: 'Apiáceas',
    imagen: '/img/plantas/cilantro.jpg',
    piso: ['frio', 'templado'], temperatura: [16, 24], ph: [6.0, 6.5], ec: [1.2, 1.8], luz: [12, 14],
    ciclo: '45–60 días; un solo corte', sistemas: ['Raíz flotante', 'Sustrato'],
    uso: 'Indispensable en la cocina colombiana y de ciclo corto.',
    consejo: 'Siembra directa y densa: no tolera el trasplante. Espiga rápido con calor, así que en clima cálido se siembra escalonado cada dos semanas.',
  },
  {
    id: 'pimenton', nombre: 'Pimentón', cientifico: 'Capsicum annuum', familia: 'Solanáceas',
    imagen: '/img/plantas/pimenton.jpg',
    piso: ['templado', 'calido'], temperatura: [21, 28], ph: [5.8, 6.5], ec: [1.8, 2.8], luz: [14, 16],
    ciclo: '90–110 días a primera cosecha', sistemas: ['Sustrato con goteo'],
    uso: 'Fruto de invernadero de alto valor, sobre todo el de color.',
    consejo: 'Poda a dos tallos y tutorado desde el principio. El fruto rojo o amarillo es el mismo verde con 3–4 semanas más en la planta.',
  },
];
