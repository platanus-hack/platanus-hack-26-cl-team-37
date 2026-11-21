# Prompt 6: juego con métricas en vivo

Adjuntar: imagenes/06a_juego_agarre.png, imagenes/06b_juego_meta_cumplida.png

---

Adjunto 06a_juego_agarre.png y 06b_juego_meta_cumplida.png. Convierte el juego actual "Caja de juguetes" en /sesion/:id/jugar. No reescribas la escena ni la física: envuélvelas.

PANTALLA (horizontal)
- Si el teléfono está en vertical, muestra "Gira tu teléfono". Intenta bloquear la orientación en pantalla completa donde el navegador lo permita. Usa Wake Lock para que la pantalla no se apague.
- Panel izquierdo como el actual: título, estado de cada mano (—, Abierta, Agarrando), pista y "Reiniciar objetos".
- Arriba al centro: tiempo transcurrido y agarres logrados / meta, con barra.
- Abajo a la izquierda, métricas en vivo: apertura de pinza en cm con minigráfico, flexión del índice en grados y suavidad.
- Abajo a la derecha: miniatura de la cámara con los puntos de la mano.
- Agrega una caja en la mesa como destino. Un agarre cuenta cuando un objeto tomado con pinza se suelta dentro de la caja.
- Aviso "Meta cumplida" al llegar a la meta.

MÓDULO metrics/ (funciones puras con pruebas unitarias)
- Apertura de pinza: distancia entre los puntos 4 (pulgar) y 8 (índice) en worldLandmarks, pasada a cm con la escala de la calibración.
- Flexión por articulación: ángulo entre segmentos consecutivos. Para el índice, MCP usa 0-5 y 5-6; PIP usa 5-6 y 6-7. Igual para cada dedo.
- Detección de agarre con histéresis: cierra bajo un umbral, abre sobre otro mayor, y solo si hay un objeto cerca.
- Por cada agarre: mano, objeto, tiempo desde que se toma hasta que se suelta, y si terminó dentro de la caja.
- Precisión = agarres exitosos / intentos.
- Suavidad: SPARC o jerk normalizado de la trayectoria de la muñeca, llevado a una escala de 0 a 100. Documenta la fórmula elegida.
- Calidad del registro: porcentaje de cuadros con la mano detectada.

REGISTRO
- Guarda cada evento en EventoSesion con su marca de tiempo.
- Guarda muestras de apertura y ángulos a 10 Hz. Nunca cuadros de video.
- Pausa automática si se pierde la mano por más de 2 s; botón de pausa manual.
- Al cumplirse el tiempo o al tocar "Terminar": calcula los agregados de la sesión (agarres por mano, precisión, tiempo medio por agarre, apertura máxima, flexión máxima por dedo, suavidad) y va a /sesion/:id/sensacion.

RENDIMIENTO
- Objetivo: 24 fps o más en un teléfono de gama media. Limita el pixel ratio a 1,5 y abarata las sombras si hace falta. Muestra los fps en un modo de depuración.
