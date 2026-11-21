# Prompt 5: calibración con MediaPipe

Adjuntar: imagenes/05_calibracion.png

---

Adjunto 05_calibracion.png. Construye /sesion/:id/calibrar y, con ella, el módulo de seguimiento de manos que también usará el juego.

MÓDULO tracking/
- Si el juego ya tiene código de MediaPipe, muévelo a este módulo sin cambiar su comportamiento.
- Usa HandLandmarker de @mediapipe/tasks-vision: runningMode "VIDEO", numHands 2, delegate "GPU" con respaldo a CPU. Sirve el modelo hand_landmarker.task y los archivos wasm desde la propia app, no desde un CDN.
- Cámara frontal con getUserMedia (facingMode "user", 640x480, 30 fps). El video lleva playsinline y muted.
- detectForVideo es síncrono y bloquea la interfaz: procesa solo el cuadro más reciente y evalúa moverlo a un Web Worker si baja de 24 fps.
- Suaviza los puntos con un filtro One Euro.
- Expone: manos [lado, landmarks, worldLandmarks, confianza], fps y estado (sin permiso | buscando | detectada | perdida).
- Verifica en un teléfono real que izquierda y derecha no queden invertidas con la imagen en espejo.

PANTALLA
- Video en espejo a pantalla completa con los 21 puntos y sus conexiones dibujados encima. Marco guía que cambia a verde cuando la mano está dentro.
- Pasos guiados: mostrar la mano abierta 2 s, abrir y cerrar 3 veces, hacer una pinza.
- Lista de chequeo en vivo:
  - Iluminación: luminancia media del cuadro dentro de un rango.
  - Distancia: estimada por el tamaño de la mano en la imagen. Es aproximada; muéstrala como "aprox.".
  - Confianza de detección.
  - Largo de la mano en cm (muñeca a punta del dedo medio, sumando segmentos de worldLandmarks).
- Si el perfil tiene un largo de mano medido con regla, úsalo como escala y compara con el estimado.
- Guarda en la Sesion: largo de mano, apertura máxima de pinza y rango abrir/cerrar como línea base, fps y confianza media.
- Maneja: permiso denegado (explica cómo activarlo), sin cámara, poca luz, mano fuera de cuadro.
- Al completar, continúa a /sesion/:id/jugar.
