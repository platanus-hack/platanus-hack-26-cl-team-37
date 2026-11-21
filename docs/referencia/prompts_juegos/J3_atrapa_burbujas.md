# Prompt J3: Atrapa burbujas

Adjuntar: imagenes_juegos/03_atrapa_burbujas.png

Gesto que trabaja: alcance y extensión de dedos.

---

Adjunto 03_atrapa_burbujas.png. Construye el juego "Atrapa burbujas" sobre la base común de juegos y regístralo.

CÓMO SE JUEGA
- Flotan burbujas sobre la mesa. Una es el objetivo (amarilla, con brillo).
- La burbuja objetivo se revienta cuando el paciente la toca con la mano bien abierta. Con la mano cerrada o a medio abrir no cuenta, y la pista se lo recuerda.
- Al reventar: animación corta, "+1" y aparece el siguiente objetivo.

DETECCIÓN
- Extensión de dedos: promedio de la extensión de las articulaciones MCP y PIP de los cuatro dedos, normalizado entre el puño y la mano abierta medidos en la calibración. Umbral configurable (por defecto 80 %).
- Toque: la palma dentro del radio de la burbuja.

ZONA DE APARICIÓN
- Las primeras burbujas aparecen en una zona cómoda, cerca de la posición de reposo de la mano. La zona se amplía a medida que el paciente acierta.
- El terapeuta puede limitar la zona desde el plan (por ejemplo, solo lado derecho o solo altura media).

NIVELES
- 1: burbujas grandes, quietas, cerca, sin límite de tiempo.
- 3: medianas, se mueven lento, 6 s de vida.
- 5: chicas, se mueven, 3 s de vida, zona completa.

MÉTRICAS
- Extensión de dedos al tocar, en porcentaje.
- Alcance máximo: desplazamiento de la muñeca desde la posición de reposo, en cm, con la escala de la calibración. Muéstralo como aproximado.
- Tiempo de reacción: desde que aparece el objetivo hasta que se revienta.
- Mapa de zonas alcanzadas por cada mano, para el terapeuta.
- En vivo: extensión, alcance máximo y tiempo de reacción. Contador: burbujas / meta.

EVENTOS: objetivo_mostrado (posición), reventada (mano, extensión, tiempo), intento_cerrado, expirada.

Criterio de aceptación: con la mano a medio abrir la burbuja no se revienta; con la mano abierta sí, y el resumen muestra hasta dónde llegó cada mano.
