# Prompt J0: base común de juegos

Adjuntar: imagenes_juegos/00_seis_juegos_nuevos.png

---

Adjunto 00_seis_juegos_nuevos.png con seis juegos que vamos a agregar. Antes de construirlos, saca de "Caja de juguetes" todo lo que es común a cualquier juego, sin cambiar cómo se juega hoy.

BASE COMÚN (games/shell)
- La pantalla horizontal con su HUD: panel izquierdo (título, estado de cada mano, pista, "Reiniciar"), barra superior (tiempo y contador contra la meta), métricas en vivo abajo a la izquierda (hasta 3, la primera con minigráfico), miniatura de cámara y botón "Menú".
- Ciclo de sesión: inicio, pausa manual, pausa automática por pérdida de seguimiento, término por tiempo o por meta, y paso a /sesion/:id/sensacion.
- Registro: una función para anotar eventos en EventoSesion y otra para muestras a 10 Hz. Cada juego declara sus tipos de evento.
- Acceso a tracking/ y metrics/ ya construidos, y a los datos de calibración de la sesión.
- Escena 3D base: mesa, luces, cámara y las manos virtuales.

CONTRATO DE UN JUEGO
Cada juego es un módulo que declara:
- id, nombre, gestos que trabaja y miniatura, para games/registry.
- Qué cambia en cada nivel del 1 al 5.
- La meta de la sesión y cómo se cuenta (por ejemplo "12 agarres" o "20 burbujas").
- Sus métricas en vivo y sus métricas de resumen, con nombre, unidad y fórmula.
- montar(escena), actualizar(manos, dt) y desmontar().

RESUMEN Y PROGRESO
- /sesion/:id/resumen y /progreso deben leer las métricas declaradas por cada juego, en vez de asumir las de Caja de juguetes.
- Las metas del plan del terapeuta pasan a ser por juego.

Criterio de aceptación: Caja de juguetes funciona igual que antes, pero ahora montada sobre la base común. Muéstrame el contrato final antes de seguir con los juegos.
