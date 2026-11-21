# Bitácora P3

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · F25 Exprime la naranja: correcciones de la revisión del PR #20

- Hecho: tarjeta de barras legible en el teléfono (diseño y colocación en píxeles CSS, ≈210×116 px, letra 15/14 px, sin lista de pasos, lienzo = diseño × min(1.5, devicePixelRatio), textura sin mipmaps con filtro lineal, material `toneMapped: false`); la raya de la marca ya no pisa la etiqueta (etiqueta "Cierre 100 %" en la barra y "marca 75 %" sobre la raya).
- Hecho: el sostén deja de sumar en el paso 4 y se guarda el tiempo pedido (3 s de sostén + 10 s de puño = 3 s); la fórmula de la métrica dice "sobre umbral − 10"; "Apretando" → "Puño cerrado", "Apretones" → "Cierres"; "Reiniciar" a mitad de una repetición emite `repeticion_incompleta` con su paso (`cortarRepeticion`).
- Pruebas: unitarias nuevas (sostén fijo en el paso 4, `cortarRepeticion` por paso, fórmula y textos del módulo; la prueba de palabras prohibidas incluye ahora apretar/apretando/apretones) y e2e ampliados (HUD 3,0 s con el puño cerrado en el paso 4, Reiniciar incompleta con eventos cerrados). Captura nueva en docs/capturas/exprime-naranja.png (844×390).
- Pendiente: panel de pasos en DOM como el resto del HUD (necesita `HudJuego.panel` de P2, contratos §8).
## 2026-11-21 · Piano de dedos (F27) · ajustes tras la revisión del PR #21

- **Sonido en iPhone:** el `AudioContext` se crea al montar el juego (fuera de un toque), así que en iOS Safari queda `suspended`. El botón ahora se ve silenciado mientras el contexto no está en `running` (`botonSilenciado`), y el toque llama a `desbloquear()` (`accionToqueSonido`): silenciado o contexto sin correr → desbloquea y activa; sonando → silencia. Se refresca cada cuadro. Pruebas unitarias de la lógica pura.
- **Botón de sonido dentro de `.juego`** (no en `document.body`): queda bajo la capa de pausa y el aviso "Gira tu teléfono". Se quita en `desmontar`.
- **Dedo que no vuelve al reposo:** un dedo abajo se da por subido también cuando recupera el 60 % del recorrido que hizo (`RECUPERA_FRACCION`), con tope bajo el umbral de bajada (UMBRAL_BAJA − 4°) para que no se cuente doble. Antes quedaba en `sostenido` hasta "Fijar reposo". Pruebas nuevas; en la prueba de histéresis existente el valor intermedio pasó de 15° a 18° (con 15° ya recuperaba más del 60 % de 40°).
- **"Fijar reposo" dos veces en la calibración:** `inicioPausa` conserva el primer instante de pausa; antes el segundo toque lo sobrescribía y las notas volvían ya vencidas.
- **Mensaje final:** "¡Muy bien! Terminaste las notas" solo con al menos un acierto; sin aciertos, "Terminaste las notas".
- **Desfase:** `aprox: true` y la fórmula menciona 15–30 cuadros/s más la latencia del seguimiento.
- **e2e:** el primer toque al botón puede solo desbloquear el audio; la prueba toca hasta que silencia y comprueba por `estado().silencio`.
- Pendiente (no es mío): la descripción del PR sigue siendo la plantilla.
## 2026-11-21 · F26 Memoria de cartas: correcciones de la revisión del PR #23

Qué se corrigió y por qué (decisiones propias, dentro de `src/games/memoria/`, `e2e/cartas.spec.ts` y la ficha F26):
- **Salto de ±180° del giro:** `SuavizadorGiro` desenrolla el ángulo hacia el valor previo antes del One Euro y acota la salida a ±180°. Antes, +175° → −178° daba ~−47° filtrado (falso `retorno_palma_abajo`, segundo volteo sin volver a palma abajo, `pronacionMax` inflada). Pruebas nuevas con ese salto exacto.
- **Meta:** `metaAgarres` = 0 es práctica libre (meta 0, termina solo por tiempo y al completar el tablero se arma otro tras 1,5 s, sin perder los conteos); con meta > 0 es el total de pares del nivel (`metaCartas`). Se quitó `paresDeNivel(nivel.pares)` (recibía pares en vez del número de nivel). Los e2e que contaban con meta 2/4 con `metaAgarres` 0 ahora pasan `metaAgarres` 12; hay un e2e nuevo de práctica libre.
- **Reiniciar:** pone a cero `contador` y, en el agregado, pares, intentos y volteos (los giros máximos de la sesión se conservan); así `metricas.contador` coincide con `juego.pares`. Los eventos ya registrados no se borran.
- **Grados no validados visibles:** el aviso va en los nombres de las métricas en vivo y en las tarjetas del resumen, no solo en `formula`.
- **Nombres de los giros:** "Supinación/Pronación máxima" pasan a "Giro hacia palma arriba (desde palma abajo), máximo" y "Giro hacia el otro lado (desde palma abajo), máximo" (palma abajo ya es pronación completa); los ids de las métricas no cambian.
- **`sinMemoria`:** `?sinMemoria=1` solo se lee con fuente simulada (nunca con la cámara) y, si se usó, el resumen trae `sinMemoria` = 1 (0 si no). No se tocó `ParametrosSesion` (tipos de P2): el campo de los parámetros sigue siendo opcional y hoy ningún formulario lo fija.
- **Limpieza:** `scripts/crear-linea.sh` vuelto a la versión de `origin/dev`; capturas horizontales `docs/capturas/memoria-cartas.png` y `memoria-cartas-meta.png` (con `CAPTURA_MEMORIA=docs/capturas`); F26 `done`, `verify` con `-t giro`.
Pendiente: validar los grados con datos reales (F21).
