/**
 * Sistemas de cultivo: cómo llega el agua y el nutriente a la raíz.
 *
 * Ordenados de menos a más tecnificados. `inversion` y `dificultad` en
 * una escala de 1 a 3, relativa entre ellos y no absoluta.
 */
export interface Sistema {
  id: string;
  nombre: string;
  resumen: string;
  como: string;
  ventajas: string[];
  limites: string[];
  inversion: 1 | 2 | 3;
  dificultad: 1 | 2 | 3;
  para: string;
  /** El de VitalCrop. */
  vitalcrop?: boolean;
}

export const SISTEMAS: Sistema[] = [
  {
    id: 'suelo', nombre: 'Suelo con riego',
    resumen: 'La planta en tierra; el agua, por goteo o aspersión cuando toca.',
    como: 'El suelo aporta nutrientes y retiene humedad. El riego repone lo que la planta consume y lo que se evapora. Un sensor de humedad o de nivel evita regar de más.',
    ventajas: ['Lo más barato de montar', 'Tolera errores: el suelo amortigua', 'Sirve para cualquier especie'],
    limites: ['Plagas y hongos de suelo', 'Difícil de controlar la nutrición', 'Consume más agua'],
    inversion: 1, dificultad: 1,
    para: 'Frutales, raíces y quien empieza.',
    vitalcrop: true,
  },
  {
    id: 'sustrato', nombre: 'Sustrato con goteo',
    resumen: 'Sin tierra: fibra de coco, turba o cascarilla en bolsa o maceta, y solución nutritiva por gotero.',
    como: 'El sustrato solo sostiene y retiene; todo el alimento va en el agua. Se riega varias veces al día en pulsos cortos y se deja drenar un 20 %.',
    ventajas: ['Control total de la nutrición', 'Sin patógenos de suelo', 'Raíz grande: sirve para fruto'],
    limites: ['El sustrato se agota y se cambia', 'Hay que medir el drenaje', 'Más caro que el suelo'],
    inversion: 2, dificultad: 2,
    para: 'Tomate, pimentón, fresa, pepino.',
  },
  {
    id: 'flotante', nombre: 'Raíz flotante',
    resumen: 'La planta en una lámina que flota sobre un tanque de solución; la raíz cuelga dentro del agua.',
    como: 'Una bomba de aire o de recirculación mantiene el oxígeno. En VitalCrop, la bomba corre 3 minutos cada 15 de día y cada 60 de noche: la raíz necesita más oxígeno cuando hay luz.',
    ventajas: ['Muy simple: tanque, lámina y bomba', 'Crecimiento rápido en hoja', 'Estable: mucha agua amortigua los cambios'],
    limites: ['Solo hoja y aromáticas; el fruto pesa', 'Si la bomba para, la raíz se asfixia en horas', 'Temperatura del agua difícil de bajar'],
    inversion: 1, dificultad: 1,
    para: 'Lechuga, hierbabuena, espinaca, cilantro.',
    vitalcrop: true,
  },
  {
    id: 'nft', nombre: 'NFT · lámina de nutriente',
    resumen: 'Canales inclinados por los que corre una película de solución de pocos milímetros.',
    como: 'La raíz toca la lámina de agua por debajo y respira por arriba. La solución vuelve al tanque y se recircula. Es el sistema de las lechugas de supermercado.',
    ventajas: ['Muy poca agua por planta', 'Alta densidad por metro', 'Cosecha limpia, sin sustrato'],
    limites: ['Depende de la bomba: sin flujo, minutos de margen', 'Canales largos calientan la solución', 'Exige nivelación precisa'],
    inversion: 2, dificultad: 2,
    para: 'Hoja y aromáticas a escala comercial.',
  },
  {
    id: 'aeroponia', nombre: 'Aeroponía',
    resumen: 'La raíz en el aire, dentro de una cámara oscura, pulverizada con solución cada pocos minutos.',
    como: 'Nebulizadores de alta presión mojan la raíz en gotas de 50 micras. Máximo oxígeno, máximo crecimiento, mínimo margen de error.',
    ventajas: ['El crecimiento más rápido posible', 'Casi sin agua', 'Raíces limpias: sirve para semilla de papa'],
    limites: ['Boquillas que se tapan', 'Sin electricidad la planta muere en una hora', 'La inversión más alta'],
    inversion: 3, dificultad: 3,
    para: 'Investigación, semilla certificada, hoja de alto valor.',
  },
  {
    id: 'acuaponia', nombre: 'Acuaponía',
    resumen: 'Peces y plantas en el mismo circuito: el desecho del pez alimenta la planta y la planta limpia el agua.',
    como: 'Las bacterias de un biofiltro convierten el amonio de los peces en nitrato que la planta absorbe. Tilapia y lechuga es la pareja clásica.',
    ventajas: ['Dos cosechas de un agua', 'Sin fertilizante mineral', 'Circuito cerrado'],
    limites: ['Tres organismos que equilibrar', 'pH de compromiso: ni el ideal del pez ni el de la planta', 'Arranque lento: el biofiltro madura en semanas'],
    inversion: 3, dificultad: 3,
    para: 'Producción integrada y educación.',
  },
];
