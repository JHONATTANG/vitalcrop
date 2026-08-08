# VITALCROP: Arquitectura Híbrida de Monitoreo y Control Sistematizado para Agricultura de Precisión Basada en IoT y Edge Computing

---

## 1. Problemática

La agricultura tradicional y los sistemas de cultivo en ambientes controlados (invernaderos, hidroponía) se enfrentan a desafíos críticos en el siglo XXI. Entre los principales problemas se encuentran:

*   **Ineficiencia en el uso de recursos:** La administración empírica del agua y los fertilizantes resulta en un desperdicio masivo de insumos y contribuye a la lixiviación de nutrientes, afectando ecosistemas subyacentes.
*   **Falta de monitoreo en tiempo real:** Los métodos de muestreo manual son lentos, propensos a errores humanos y no proporcionan la granularidad temporal requerida para detectar el estrés hídrico o nutricional de la planta antes de que el daño sea irreversible.
*   **Gestión reactiva, no predictiva:** Sin una capa de captura y análisis continuo de datos (temperatura, humedad, pH, conductividad eléctrica), las decisiones agronómicas se toman como reacción a síntomas físicos en los cultivos, lo que compromete significativamente el rendimiento final y la calidad de la cosecha.
*   **Dependencia de infraestructura costosa y propietaria:** Las soluciones industriales suelen carecer de interoperabilidad, cerrando el ecosistema tecnológico para pequeños y medianos productores.

## 2. Justificación

El desarrollo de sistemas de agricultura inteligente mediante VITALCROP no es solo una mejora operativa, sino un imperativo tecnológico para garantizar la seguridad alimentaria y la sostenibilidad ambiental. El proyecto se justifica desde tres ejes fundamentales:

*   **Impacto Tecnológico:** Introduce un paradigma de "Edge-to-Cloud" en entornos rurales y semiurbanos, democratizando el acceso a la instrumentación de grado industrial mediante hardware de bajo costo (COTS - Commercial Off-The-Shelf) y protocolos abiertos.
*   **Impacto Económico:** Maximiza el ROI (Retorno de Inversión) del productor agrario al reducir los costos de insumos (agua y soluciones nutritivas) y minimizar las pérdidas biológicas causadas por condiciones climáticas subóptimas.
*   **Impacto Ambiental:** Fomenta la agricultura de precisión, garantizando que cada planta reciba el volumen exacto de nutrientes y agua que requiere (basado en curvas específicas de absorción), disminuyendo drásticamente la huella hídrica y de carbono.

## 3. Descripción general del sistema

VITALCROP es un ecosistema tecnológico integral de Internet de las Cosas (IoT) diseñado para el monitoreo telemétrico automatizado y el actuacionismo estructurado sobre cultivos. A diferencia de las plataformas tradicionales y monolíticas, VITALCROP se concibe como una red distribuida de nodos inteligentes, capaces de abstraer la complejidad física del entorno agronómico y transformarla en puntos de datos escalables.

Lo que hace innovador a VITALCROP es su **arquitectura jerárquica de tres niveles (Edge - Gateway - Cloud)** que garantiza resiliencia ante pérdida de conectividad, procesamiento de latencia ultrabaja cerca del origen de los datos (Edge Computing) y un ecosistema de analítica persistente basado en tecnologías web y bases de datos modernas (PostgreSQL/Supabase).

## 4. Arquitectura del sistema (Detallada)

La topología del sistema sigue una arquitectura orientada a eventos en la nube, acoplada a una red área local (LAN) de topología estrella-jerárquica.

### 4.1. Capa Edge (Nodos de Detección y Control - ESP32)
*   **Responsabilidad:** Interfaz directa con el entorno biológico y físico de la planta.
*   **Operación:** Adquisición de señales analógicas y digitales, conversión ADC, prefiltrado de ruido algorítmico (e.g., filtros de media móvil para sensores de pH), y empaquetado inicial de telemetría. Controlan los micro-ciclos y bucles de control locales en hardware (PID si aplica).
*   **Conectividad:** Wi-Fi local (802.11 b/g/n) operando en la banda de 2.4GHz para garantizar la mayor tasa de penetración de señal en entornos físicos densos (como el follaje o muros de invernadero).

### 4.2. Capa Gateway (Middleware de Borde - Raspberry Pi)
*   **Responsabilidad:** Orquestación, mediación de red local y resiliencia de borde.
*   **Operación:** Actúa como un coordinador (Edge Node Coordinator). Mantiene un broker de mensajería ligero en las instalaciones del cultivo. Si la conexión a Internet remota (WAN) sufre caídas, el Gateway mantiene las ejecuciones lógicas críticas, funcionando como búfer local (FIFO) para evitar pérdida de datos telemétricos.
*   **Protocolos:** Maneja conexiones M2M (Machine-to-Machine) vía **MQTT (Message Queuing Telemetry Transport)**. Traduce los tópicos MQTT a peticiones HTTPS/WSS orientadas al Backend centralizado.

### 4.3. Capa Cloud y Analítica (Backend API y Supabase)
*   **Responsabilidad:** Registro histórico persistente, control de accesos (Auth), exposición de interfaces REST/GraphQL y persistencia relacional.
*   **Operación:** Los datos se procesan en un entorno *serverless* o contenedorizado (FastAPI en Python / Next.js API Routes). La capa de base de datos se apoya en Supabase (PostgreSQL), utilizando Row Level Security (RLS) para arquitecturas multi-inquilino (multi-tenant) seguras.

### 4.4. Flujo de Datos Híbrido y Protocolos
*   El protocolo subyacente de comunicación es asíncrono. Los sensores publican *Payloads* serializados en JSON hacia tópicos definidos (`vitalcrop/telemetry/{gateway_id}/{node_id}`). El broker direcciona los datos al script integrador, quien establece un túnel TLS seguro hacia la API en la nube garantizando confidencialidad (Ataques MITM).

## 5. Componentes de hardware

La selección de hardware se enmarca en la confiabilidad, rentabilidad y extensa documentación en la industria embebida.

### 5.1. Nodos de Procesamiento Embebido
*   **Microcontrolador ESP32 (Espressif):** Base de la Capa Edge. Elegido por su procesador de doble núcleo (uno asignable exclusivamente a la pila Wi-Fi y protocolos TCP/IP, y otro a la lógica I/O libre de bloqueos), modos de sueño profundo (Deep Sleep) para ahorro energético y convertidores ADC/DAC integrados.
*   **SBC Raspberry Pi (Broadcom ARM):** Base de la Capa Gateway. Seleccionado por su capacidad para ejecutar un sistema operativo Linux completo, facilitando el alojamiento del broker MQTT local y scripts en lenguajes de alto nivel (Python/Node).

### 5.2. Red de Sensores (Inputs)
*   **Sensores Inerciales y Atmosféricos (DHT22 / BME280):** Lectura de temperatura y humedad relativa para el cálculo del Déficit de Presión de Vapor (VPD), principal indicador del estrés de la planta.
*   **Sonda Dieléctrica de pH:** Crucial en entornos hidropónicos para garantizar que la solución nutritiva mantenga los niveles idóneos para la absorción de macro/micronutrientes.
*   **Conductivímetro Eléctrico (EC Sensor):** Cuantifica la concentración de sales disueltas en ppm o mS/cm, determinando la "fuerza" del fertilizante.
*   **Sensores de Humedad de Suelo Capacitivos:** Operan midiendo la constante dieléctrica del suelo, lo que elimina el problema grave de la corrosión galvánica que sufren los sensores resistivos de bajo costo, garantizando despliegues de larga vida útil.

### 5.3. Actuadores (Outputs)
*   **Módulos de Relé Optoacoplados:** Empleados para mitigar corrientes de retorno o picos inductivos que las electroválvulas de 12V/24V, bombas de infusión peristálticas (para inyección de pH-/pH+) y sistemas de iluminación fotosintética de alta potencia generan durante la actuación.

## 6. Componentes de software

*   **Firmware del ESP32 (Edge):** Desarrollado en C/C++ usando FreeRTOS o un *Event Loop* asíncrono no bloqueante, estructurado con la librería `PubSubClient` para MQTT. Incorpora mecanismos "Watchdog" para auto-reinicio físico en caso de pánico del sistema.
*   **Broker MQTT (Gateway):** Eclipse Mosquitto actuando como centro neurálgico M2M, operando con Calidad de Servicio (QoS) de nivel 1 ("At least once") para evitar la pérdida de cualquier métrica ambiental.
*   **Backend Cloud API:** Entorno desarrollado para interoperabilidad mediante solicitudes REST, empleando autenticación de última generación JWT/OTP. Desacopla la lógica de negocio de la lógica de conexión directa con la base de datos (Data Access Object o patrón Repository).
*   **Base de Datos (Supabase / Postgres):** Estructuración jerárquica con tablas de `users`, vinculadas a `gateways`, a su vez asociadas con uno o múltiples `edge_nodes`, resultando finalmente en un esquema de `telemetry` altamente indexado para responder consultas de series temporales (Time-Series Data) velozmente en el frontend.

## 7. Flujo operativo del sistema

1. **Sensado (In Situ):** El firmware del ESP32 ejecuta la lectura algorítmica y promediada de los puertos analógicos o buses digitales (I2C/SPI) conectados a los sensores en el campo.
2. **Adquisición y Publicación:** Empaqueta en un objeto JSON (`{"pH": 6.2, "temp": 24.5}`) y transmite la trama a través del espectro Wi-Fi utilizando MQTT estándar (puerto 1883) hacia el Gateway físico ubicado en el invernadero.
3. **Consolidación de Broker:** La Raspberry Pi autentica el mensaje y el tópico; un servicio en segundo plano (daemon) captura el evento `on_message` e inserta los datos en una cola de despacho a la Nube.
4. **Transporte Transaccional Server-Side:** Los datos viajan cifrados sobre HTTPS hasta el endpoint del Cloud API (ej: `/api/telemetry/ingest`). El servidor valida el esquema y los inserta en la base de datos Supabase.
5. **Actuación Bilateral Controlada:** En caso de que se determine una anomalía (ej. pH muy alto), el sistema (o un operador humano a través del Dashboard VITALCROP) despacha un comando "DOWNSTREAM". El comando viaja en ruta inversa: Cloud -> Webhook a API Local -> Tópico MQTT `/command` -> El ESP32 suscrito detecta el mensaje, activa el relé correspondiente a la bomba de ácido (pH down) y devuelve un comando "ACK" (Acknowledge).

## 8. Escalabilidad

La arquitectura se ideó bajo el principio "Scale-Out" horizontal:

*   **Escalabilidad a Nivel Físico (Topológica):** Incrementar la densidad de medición solo requiere encender y registrar un nuevo ESP32; gracias a la naturaleza Pub/Sub del protocolo MQTT, el sistema asimila milésimas de nuevos nodos sin modificar el Broker o el Firmware de los demás componentes.
*   **Escalabilidad a Nivel API (Nube):** La utilización de bases de datos PostgreSQL robustas soportadas por arquitecturas de Connection Pooling, sumado al enfoque *Backend as a Service* (BaaS), permite transiciones asimétricas desde cientos de transacciones por segundo (TPS) hasta cargas empresariales masivas.

## 9. Innovación

El factor diferenciador de carácter científico e innovador en VITALCROP respecto a soluciones de monitoreo comercial, reside fuertemente en su **"Resiliencia de Borde Distribuida (Distributed Edge Resilience)"**.

En escenarios agroindustriales y localizaciones remotas, la oscilación y carencia de ancho de banda es la norma, no la excepción. Al dotar a la capa de Gateway intermedia de inteligencia lógica e histórico a corto plazo, VITALCROP no compromete el cultivo si hay fallos en la red externa. Sigue operando el fotoperiodo e hidratación del cultivo de forma autónoma, fusionando exitosamente la robustez de los controladores lógicos programables industriales (PLC) con la flexibilidad, conectividad ubicua y estética UI/UX del Internet de las Cosas web moderno.

## 10. Posibles aplicaciones

Gracias a su neutralidad de diseño y la abstracción de variables, este modelo tecnológico cuenta con un rango amplio de implementaciones en la vida real:

*   **Agricultura de Ambiente Controlado (CEA) e Hidroponía:** Cultivos en sustrato inerte (lana de roca o NFT), aplicando control milimétrico del balance nutricional.
*   **Invernaderos Inteligentes de Alta Densidad:** Mapeo térmico tridimensional e identificación de microclimas a través del despliegue en red mallada de nodos higrométricos.
*   **Viticultura y Agricultura a Cielo Abierto:** Automatización de sistemas de riego volumétrico y fertirriego, en base a métricas de estrés hídrico de suelo.
*   **Agricultura Urbana Automática y Muros Verdes:** Modulación y regulación de granjas de luminarias LED, adaptando el *Daily Light Integral* (DLI) óptimo dependiendo del estado fenológico del cultivo.
