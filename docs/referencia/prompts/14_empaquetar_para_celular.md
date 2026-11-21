# Prompt 14: empaquetar para celular

Sin imagen.

---

Convierte ManoViva en una app instalable en el teléfono (PWA).

- Manifest con nombre, íconos, color de tema #0f1720 y display "standalone".
- Service worker que guarde en caché la app, los archivos wasm de MediaPipe y el modelo hand_landmarker.task, para que funcione sin conexión después de la primera carga.
- Las sesiones se guardan localmente y quedan en cola para sincronizar cuando exista backend.
- Para probar en un teléfono real: sirve el entorno de desarrollo por HTTPS en la red local (la cámara no funciona con HTTP fuera de localhost) y dame los pasos exactos.
- Revisa las diferencias de iPhone: video con playsinline, permisos de cámara, y que no se puede bloquear la orientación (por eso el aviso "Gira tu teléfono").
- Respeta las zonas seguras de la pantalla (notch y barra inferior) en vertical y horizontal.
- Dime qué haría falta para publicarla en las tiendas con Capacitor, pero no lo hagas todavía.

Criterio de aceptación: instalo la app desde el navegador del teléfono, activo modo avión y completo una sesión entera.
