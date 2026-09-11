/**
 * Zonas agrícolas de Colombia para el mapa de la portada.
 *
 * El criterio de agrupación es el piso térmico, que es lo que en
 * Colombia decide qué se puede cultivar antes que el suelo o la
 * lluvia: la altitud fija la temperatura media, y la temperatura fija
 * el cultivo. Los cuatro pisos son los de la clasificación de Caldas:
 *
 *   cálido    <1.000 m   >24 °C    banano, caña, arroz, palma, cacao
 *   templado  1.000–2.000 17–24 °C  café, plátano, cítricos, aguacate
 *   frío      2.000–3.000 12–17 °C  papa, hortalizas, flores, aromáticas
 *   páramo    >3.000 m   <12 °C    papa nativa, cebolla, pastos
 *
 * Los cultivos de cada zona son los principales según las
 * evaluaciones agropecuarias del Ministerio (EVA) y el conocimiento
 * corriente del sector; el orden dentro de cada zona es por área
 * sembrada, no alfabético. Las coordenadas apuntan al centro de la
 * zona productora, no a la capital del departamento.
 */

export type Piso = 'calido' | 'templado' | 'frio' | 'paramo';

export const PISOS: Record<Piso, { nombre: string; altitud: string; temperatura: string; color: string }> = {
  calido:   { nombre: 'Cálido',   altitud: '< 1.000 m',     temperatura: '> 24 °C',   color: '#D98E32' },
  templado: { nombre: 'Templado', altitud: '1.000–2.000 m', temperatura: '17–24 °C',  color: '#2E9E5B' },
  frio:     { nombre: 'Frío',     altitud: '2.000–3.000 m', temperatura: '12–17 °C',  color: '#2A6FBF' },
  paramo:   { nombre: 'Páramo',   altitud: '> 3.000 m',     temperatura: '< 12 °C',   color: '#5B4E9E' },
};

export interface Zona {
  id: string;
  nombre: string;
  departamento: string;
  lat: number;
  lon: number;
  piso: Piso;
  altitud: string;
  cultivos: string[];
  nota: string;
  /** El cultivo de VitalCrop. Se pinta distinto y va al centro del relato. */
  vitalcrop?: boolean;
  /** Foto de la zona o de su cultivo principal. Ver datos/creditos.ts. */
  imagen: string;
  pie: string;
}

export const ZONAS: Zona[] = [
  {
    id: 'sabana', nombre: 'Sabana de Bogotá', departamento: 'Cundinamarca · Bogotá D.C.',
    imagen: '/img/zonas/sabana.jpg', pie: 'Invernaderos en Nemocón, Sabana de Bogotá',
    lat: 4.72, lon: -74.22, piso: 'frio', altitud: '2.550–2.650 m',
    cultivos: ['Flores de exportación', 'Hortalizas de hoja', 'Hierbas aromáticas', 'Papa', 'Fresa'],
    nota: 'El núcleo aromático exportador del país: hierbabuena, menta, albahaca, tomillo y romero salen de Madrid, Funza y Facatativá hacia Estados Unidos y Europa. Aquí está VitalCrop.',
    vitalcrop: true,
  },
  {
    id: 'boyaca', nombre: 'Altiplano de Boyacá', departamento: 'Boyacá',
    imagen: '/img/zonas/boyaca.jpg', pie: 'Papa en flor en el altiplano',
    lat: 5.62, lon: -73.25, piso: 'frio', altitud: '2.500–2.900 m',
    cultivos: ['Papa', 'Cebolla larga', 'Hortalizas', 'Durazno y manzana', 'Cebolla de bulbo'],
    nota: 'Primer productor de papa del país. La cebolla larga de Aquitania, a orillas de la laguna de Tota, abastece a media Colombia.',
  },
  {
    id: 'oriente', nombre: 'Oriente antioqueño', departamento: 'Antioquia',
    imagen: '/img/zonas/oriente.jpg', pie: 'Hortensia, la flor de exportación del Oriente',
    lat: 6.13, lon: -75.38, piso: 'frio', altitud: '2.100–2.400 m',
    cultivos: ['Flores', 'Papa', 'Hortalizas', 'Aguacate Hass', 'Fresa'],
    nota: 'Rionegro, La Ceja y El Carmen de Viboral: el otro gran polo de flores y hortalizas de clima frío, con el aeropuerto al lado.',
  },
  {
    id: 'narino', nombre: 'Altiplano de Nariño', departamento: 'Nariño',
    imagen: '/img/zonas/narino.jpg', pie: 'Laderas cultivadas en Nariño',
    lat: 1.05, lon: -77.4, piso: 'paramo', altitud: '2.800–3.200 m',
    cultivos: ['Papa', 'Cebolla', 'Café de altura', 'Arveja', 'Cebada'],
    nota: 'Papa en el altiplano y, bajando hacia el norte, uno de los cafés más apreciados del país por la altura y la cercanía al Ecuador.',
  },
  {
    id: 'cafetero', nombre: 'Eje Cafetero', departamento: 'Caldas · Quindío · Risaralda',
    imagen: '/img/zonas/cafetero.jpg', pie: 'Valle de Cocora, Quindío',
    lat: 4.95, lon: -75.62, piso: 'templado', altitud: '1.200–1.900 m',
    cultivos: ['Café', 'Plátano', 'Aguacate Hass', 'Cítricos', 'Cacao'],
    nota: 'Paisaje Cultural Cafetero, patrimonio de la humanidad. El plátano y el café comparten lote: uno da sombra y el otro, ingreso.',
  },
  {
    id: 'huila', nombre: 'Huila cafetero', departamento: 'Huila',
    imagen: '/img/zonas/huila.jpg', pie: 'Cafetal en Pitalito',
    lat: 2.05, lon: -75.95, piso: 'templado', altitud: '1.300–1.900 m',
    cultivos: ['Café', 'Arroz', 'Cacao', 'Granadilla y maracuyá', 'Lulo'],
    nota: 'Desde hace una década es el primer productor de café del país. En el valle, arroz de riego en Campoalegre.',
  },
  {
    id: 'cauca', nombre: 'Meseta de Popayán', departamento: 'Cauca',
    imagen: '/img/zonas/cauca.jpg', pie: 'Cerezas de café madurando',
    lat: 2.55, lon: -76.62, piso: 'templado', altitud: '1.500–1.900 m',
    cultivos: ['Café', 'Caña panelera', 'Aguacate Hass', 'Fique', 'Mora'],
    nota: 'Cafés de pequeña finca y caña para panela, el endulzante de la casa campesina. El fique se hila para los empaques del propio café.',
  },
  {
    id: 'santander', nombre: 'Santander cacaotero', departamento: 'Santander',
    imagen: '/img/zonas/santander.jpg', pie: 'Mazorca de cacao abierta, San Vicente de Chucurí',
    lat: 6.9, lon: -73.4, piso: 'templado', altitud: '700–1.600 m',
    cultivos: ['Cacao', 'Cítricos', 'Piña', 'Palma de aceite', 'Café'],
    nota: 'Primer productor de cacao del país, en San Vicente de Chucurí y el Carmen. La piña de Lebrija y las naranjas del Socorro completan el cuadro.',
  },
  {
    id: 'tolima', nombre: 'Valle del Magdalena', departamento: 'Tolima',
    imagen: '/img/zonas/tolima.jpg', pie: 'Arrozal en el valle del Magdalena',
    lat: 4.15, lon: -74.9, piso: 'calido', altitud: '300–450 m',
    cultivos: ['Arroz', 'Mango', 'Algodón', 'Aguacate', 'Café en ladera'],
    nota: 'Arroz de riego en Saldaña y el Espinal, y el mango de la Mesa de los Santos. En la cordillera, café.',
  },
  {
    id: 'valle', nombre: 'Valle geográfico del Cauca', departamento: 'Valle del Cauca',
    imagen: '/img/zonas/valle.jpg', pie: 'Cañaduzal en el Valle',
    lat: 3.55, lon: -76.3, piso: 'calido', altitud: '950–1.050 m',
    cultivos: ['Caña de azúcar', 'Piña y papaya', 'Maracuyá', 'Hortalizas', 'Sorgo'],
    nota: 'Un valle plano de 200 km sembrado casi entero de caña: azúcar, bioetanol y panela. Los frutales crecen en las laderas.',
  },
  {
    id: 'uraba', nombre: 'Urabá', departamento: 'Antioquia',
    imagen: '/img/zonas/uraba.jpg', pie: 'Racimo de banano de exportación',
    lat: 7.85, lon: -76.62, piso: 'calido', altitud: '20–50 m',
    cultivos: ['Banano de exportación', 'Plátano', 'Palma de aceite', 'Cacao', 'Maíz'],
    nota: 'El banano colombiano de exportación sale casi entero de aquí y de la Zona Bananera del Magdalena. Riego, cable vía y embarque a dos horas.',
  },
  {
    id: 'caribe', nombre: 'Zona Bananera y valle del Cesar', departamento: 'Magdalena · Cesar',
    imagen: '/img/zonas/caribe.jpg', pie: 'Palma de aceite desde el aire',
    lat: 10.45, lon: -74.15, piso: 'calido', altitud: '10–150 m',
    cultivos: ['Banano', 'Palma de aceite', 'Mango', 'Arroz', 'Café en la Sierra'],
    nota: 'Banano en Ciénaga, palma en el Cesar, y en la Sierra Nevada un café de altura a pocos kilómetros del mar.',
  },
  {
    id: 'sinu', nombre: 'Valle del Sinú', departamento: 'Córdoba · Sucre',
    imagen: '/img/zonas/sinu.jpg', pie: 'Maíz cosechado',
    lat: 8.75, lon: -75.9, piso: 'calido', altitud: '10–60 m',
    cultivos: ['Maíz', 'Arroz', 'Ñame', 'Plátano', 'Algodón'],
    nota: 'La despensa de maíz y ñame de la costa. Un valle aluvial que se inunda y se siembra al ritmo del río.',
  },
  {
    id: 'llanos', nombre: 'Piedemonte llanero', departamento: 'Meta · Casanare',
    imagen: '/img/zonas/llanos.jpg', pie: 'Arroz de riego en la llanura',
    lat: 4.3, lon: -73.1, piso: 'calido', altitud: '200–450 m',
    cultivos: ['Arroz', 'Palma de aceite', 'Soja', 'Maíz tecnificado', 'Cítricos'],
    nota: 'La frontera agrícola del país: suelos de sabana corregidos con cal y fósforo, maquinaria y lotes de cientos de hectáreas.',
  },
  {
    id: 'pamplona', nombre: 'Provincia de Pamplona', departamento: 'Norte de Santander',
    imagen: '/img/zonas/pamplona.jpg', pie: 'Cosecha de cebolla en sacos',
    lat: 7.38, lon: -72.65, piso: 'frio', altitud: '2.300–2.700 m',
    cultivos: ['Cebolla', 'Fresa', 'Papa', 'Hortalizas', 'Durazno'],
    nota: 'Un enclave de clima frío entre el cálido de Cúcuta y el Catatumbo. Cebolla y fresa para el mercado del oriente.',
  },
  {
    id: 'amazonia', nombre: 'Piedemonte amazónico', departamento: 'Putumayo · Caquetá',
    imagen: '/img/zonas/amazonia.jpg', pie: 'Mazorcas de cacao bajo sombra',
    lat: 1.15, lon: -75.6, piso: 'calido', altitud: '250–600 m',
    cultivos: ['Cacao', 'Chontaduro', 'Sacha inchi', 'Caucho', 'Piscicultura'],
    nota: 'Cultivos de sombra y sistemas agroforestales: lo que cabe bajo el dosel sin tumbarlo.',
  },
];

/** Todos los cultivos que aparecen en alguna zona, sin repetir. */
export const CULTIVOS_UNICOS = Array.from(new Set(ZONAS.flatMap((z) => z.cultivos))).sort((a, b) =>
  a.localeCompare(b, 'es'));
