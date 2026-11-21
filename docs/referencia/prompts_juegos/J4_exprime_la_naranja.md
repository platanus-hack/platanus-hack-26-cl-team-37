# Prompt J4: Exprime la naranja

Adjuntar: imagenes_juegos/04_exprime_la_naranja.png

Gesto que trabaja: cierre de puño y apertura completa.

---

Adjunto 04_exprime_la_naranja.png. Construye el juego "Exprime la naranja" sobre la base común de juegos y regístralo.

CÓMO SE JUEGA
- Hay un vaso al centro y una fuente con naranjas. Cada repetición tiene cuatro pasos guiados:
  1. Mano abierta sobre el vaso: aparece una naranja en la mano.
  2. Cerrar el puño hasta pasar el umbral.
  3. Sostener el puño N segundos; una barra muestra el avance y caen gotas al vaso.
  4. Abrir la mano por completo; el nivel del vaso sube.
- La repetición solo cuenta si se cumplen los cuatro pasos.

DETECCIÓN
- Cierre de puño en porcentaje: 0 % es la mano abierta de la calibración y 100 % el puño de la calibración. Calcúlalo con la distancia de las yemas al centro de la palma, normalizada por el largo de la mano.
- Importante: la cámara no mide fuerza. No muestres palabras como "fuerza" o "presión" en ninguna parte del juego ni del resumen.

NIVELES
- 1: umbral de cierre 60 %, sostener 1 s.
- 3: umbral 75 %, sostener 3 s.
- 5: umbral 90 %, sostener 5 s.

MÉTRICAS
- Cierre máximo por repetición, en porcentaje.
- Tiempo sostenido sobre el umbral.
- Apertura completa entre repeticiones, en porcentaje.
- Repeticiones válidas e incompletas; ritmo (repeticiones por minuto).
- En vivo: cierre de puño con minigráfico, tiempo sostenido y apertura completa. Contador: apretones / meta.

EVENTOS: cierre_inicio, umbral_alcanzado, sostenido_completo, apertura_completa, repeticion_incompleta (paso en que falló).

Criterio de aceptación: si suelto antes de tiempo, la repetición no cuenta y queda anotada como incompleta con el paso en que falló.
