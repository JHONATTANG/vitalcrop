// ============================================================
//  secrets.example.h — PLANTILLA. Copiar a secrets.h y rellenar.
// ============================================================
//      cp include/secrets.example.h include/secrets.h
//
//  `secrets.h` está en .gitignore y NO se sube. Este archivo sí, para
//  que quien clone el repositorio sepa qué tiene que definir.
//
//  Por qué existe: el repositorio es público. La contraseña del punto
//  de acceso del cultivo y la de OTA estaban escritas en config.h, que
//  se versiona, así que cualquiera con acceso al repo podía asociarse
//  a la red del cultivo y reflashear el nodo por aire.
// ============================================================

#ifndef SECRETS_H
#define SECRETS_H

// Contraseña del punto de acceso privado que levanta la Raspberry.
// Debe coincidir con wpa_passphrase de hostapd.conf en el gateway.
#define WIFI_PASS_SECRETO     "CAMBIAR_POR_LA_CLAVE_DEL_AP"

// Contraseña de actualización por aire (ArduinoOTA).
#define OTA_PASSWORD_SECRETO  "CAMBIAR_POR_LA_CLAVE_OTA"

#endif // SECRETS_H
