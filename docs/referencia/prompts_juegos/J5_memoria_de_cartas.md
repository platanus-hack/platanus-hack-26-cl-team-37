# Prompt J5: Memoria de cartas

Adjuntar: imagenes_juegos/05_memoria_de_cartas.png

Gesto que trabaja: giro del antebrazo (pronación y supinación).

---

Adjunto 05_memoria_de_cartas.png. Construye el juego "Memoria de cartas" sobre la base común de juegos y regístralo.

CÓMO SE JUEGA
- Cartas boca abajo en una grilla sobre la mesa. El paciente lleva la mano sobre una carta con la palma hacia abajo y gira la palma hacia arriba: la carta se voltea siguiendo el giro.
- Para voltear otra carta debe volver primero a palma abajo.
- Dos cartas iguales forman un par y quedan boca arriba; si no coinciden, se vuelven a tapar.
- Modo "sin memoria" (activable por el terapeuta): las figuras están siempre visibles y solo se trabaja el giro.

DETECCIÓN
- Orientación de la palma: normal de la palma calculada con el producto cruz de los vectores muñeca→base del índice (0→5) y muñeca→base del meñique (0→17) en worldLandmarks. El giro es el ángulo de esa normal respecto de la posición palma abajo.
- Esta es la medida más ruidosa de toda la app. Suavízala, exige mantener el giro 0,3 s antes de voltear y deja el umbral configurable. Inclúyela en el protocolo de validación del Prompt 15 antes de mostrar grados al terapeuta.

NIVELES
- 1: grilla 2x2, voltear con 45° de giro.
- 3: grilla 2x4, 60°.
- 5: grilla 3x4, 80°.

MÉTRICAS
- Giro alcanzado en cada volteo, en grados.
- Supinación máxima y pronación máxima de la sesión.
- Pares encontrados, intentos y tiempo total.
- En vivo: giro del antebrazo con minigráfico, supinación máxima y pronación máxima. Contador: pares / total.

EVENTOS: sobre_carta, volteo (carta, grados), par, no_par, retorno_palma_abajo.

Criterio de aceptación: con un giro menor al umbral la carta se inclina pero no se voltea; el resumen muestra el giro máximo hacia cada lado.
