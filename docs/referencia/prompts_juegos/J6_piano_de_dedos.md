# Prompt J6: Piano de dedos

Adjuntar: imagenes_juegos/06_piano_de_dedos.png

Gesto que trabaja: independencia de dedos y coordinación.

---

Adjunto 06_piano_de_dedos.png. Construye el juego "Piano de dedos" sobre la base común de juegos y regístralo.

CÓMO SE JUEGA
- Cinco teclas de colores por mano, una bajo cada dedo. Las manos se apoyan en el aire sobre las teclas, con la palma hacia abajo.
- Caen notas del color de cada tecla. Cuando una nota llega a la línea, el paciente baja solo ese dedo.
- La tecla se enciende y suena su nota. Agrega un botón para silenciar.

DETECCIÓN
- Dedo abajo: la flexión de la articulación MCP de ese dedo supera un umbral medido respecto de su posición de reposo, mientras los demás dedos se mantienen bajo el umbral.
- Independencia: 1 − (movimiento promedio de los otros dedos / movimiento del dedo objetivo), en porcentaje.
- Antes de empezar, 3 s con la mano quieta para fijar la posición de reposo de cada dedo.

NIVELES
- 1: una mano, solo índice y medio, ritmo lento, ventana de acierto amplia.
- 3: una mano, cinco dedos, ritmo medio.
- 5: dos manos, cinco dedos, ritmo rápido, ventana estrecha.

MÉTRICAS
- Aciertos, notas perdidas y dedos equivocados.
- Independencia por dedo, en porcentaje.
- Desfase medio respecto del ritmo, en ms.
- Errores por dedo, para que el terapeuta vea cuál cuesta más.
- En vivo: independencia con minigráfico, aciertos y desfase. Contador: notas / total.

EVENTOS: nota_mostrada (dedo), acierto (dedo, desfase, independencia), dedo_equivocado, nota_perdida.

Criterio de aceptación: si bajo dos dedos a la vez, la nota no cuenta como acierto limpio y la independencia de ese dedo baja en el resumen.
