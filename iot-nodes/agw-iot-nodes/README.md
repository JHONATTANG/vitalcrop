# VitalCrop AGW IoT Nodes

Este repositorio contiene el firmware unificado para los nodos del sistema IoT de VitalCrop. El mismo código base soporta distintos nodos (SOIL y HYDRO), definidos a través de banderas de compilación y configuración estática.

## Estructura del Nodo SOIL
- **Sensores:** Temperatura y Humedad (DHT22), Humedad de Suelo (Capacitivo).
- **Actuadores:** Relé Bomba, Válvula 1, Válvula 2.

## Estructura del Nodo HYDRO
- **Sensores:** Temperatura de Agua (DS18B20), Nivel de Agua (HC-SR04), pH Analógico, EC Analógico.
- **Actuadores:** Relé Bomba, Válvula 1, Válvula 2.

## Compilación y Flasheo

1. Abre la carpeta `agw-iot-nodes` en VSCode con la extensión PlatformIO.
2. En el archivo `platformio.ini`, edita `build_flags` para seleccionar el tipo de nodo a compilar:
   - `-DSOIL_NODE` (para nodo suelo)
   - `-DHYDRO_NODE` (para nodo hidropónico)
3. Modifica tus credenciales en `src/config.h` (WIFI_SSID, MQTT_BROKER, etc).
4. Conecta el ESP32 DevKit V1 por USB.
5. Haz clic en **Upload** (subir) en PlatformIO o ejecuta:
   ```bash
   pio run -t upload
   ```

## Actualizaciones OTA (Over The Air)
El nodo soporta actualizaciones por WiFi después del primer flasheo serial. 
Para actualizar:
```bash
pio run -t upload --upload-port <IP_DEL_NODO> --upload-flags="--auth=ota_secure_password"
```

## Calibración de Sensores Analógicos (pH & EC)
Los sensores de pH y EC requieren calibración usando la NVS (Non-Volatile Storage) del ESP32.
Actualmente se proveen métodos base para almacenar voltajes de referencia y puntos de pH/EC. Se recomienda implementar un comando MQTT `"CALIBRATE_PH"` que guarde las lecturas en la memoria NVS para evitar hardcodear curvas de calibración.
