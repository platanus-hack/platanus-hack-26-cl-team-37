# Prompt J2: Pinza fina

Adjuntar: imagenes_juegos/02_pinza_fina.png

Gesto que trabaja: oposición del pulgar con cada dedo.

---

Adjunto 02_pinza_fina.png. Construye el juego "Pinza fina" sobre la base común de juegos y regístralo.

CÓMO SE JUEGA
- No usa física. Se ve una mano virtual grande, de frente, que copia la mano del paciente.
- Se ilumina la yema de un dedo (índice, medio, anular o meñique). El paciente la toca con la yema del pulgar, mantiene 0,3 s y separa.
- Arriba, una fila de luces muestra el avance de la secuencia.
- Tocar un dedo distinto al iluminado cuenta como error, sin castigo visual fuerte.
- Si el paciente no logra tocar en el tiempo límite, el juego pasa al dedo siguiente y guarda la distancia mínima que alcanzó. Nunca se queda bloqueado.

DETECCIÓN
- Toque: distancia entre la punta del pulgar (punto 4) y la punta del dedo objetivo (8, 12, 16 o 20) bajo un umbral proporcional al largo de la mano calibrado. Usa histéresis para soltar.

NIVELES
- 1: secuencia fija índice-medio-anular-meñique, sin límite de tiempo.
- 3: secuencia aleatoria, 4 s por toque.
- 5: secuencias que hay que recordar y repetir, 2 s por toque.

MÉTRICAS
- Tiempo por toque.
- Distancia mínima pulgar–dedo por cada dedo, en cm. Es la métrica clave cuando el paciente aún no alcanza.
- Aciertos y errores; qué dedos no alcanza.
- En vivo: tiempo por toque, distancia pulgar–dedo y posición en la secuencia. Contador: toques / meta.

EVENTOS: objetivo_mostrado, toque (dedo, tiempo), error (dedo tocado), no_alcanzado (dedo, distancia mínima).

Criterio de aceptación: completo una secuencia con cada mano; si dejo un dedo sin tocar, el juego avanza y el resumen muestra la distancia que faltó.
