# Bitácora P3

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · Piano de dedos (F27) · ajustes tras la revisión del PR #21

- **Sonido en iPhone:** el `AudioContext` se crea al montar el juego (fuera de un toque), así que en iOS Safari queda `suspended`. El botón ahora se ve silenciado mientras el contexto no está en `running` (`botonSilenciado`), y el toque llama a `desbloquear()` (`accionToqueSonido`): silenciado o contexto sin correr → desbloquea y activa; sonando → silencia. Se refresca cada cuadro. Pruebas unitarias de la lógica pura.
- **Botón de sonido dentro de `.juego`** (no en `document.body`): queda bajo la capa de pausa y el aviso "Gira tu teléfono". Se quita en `desmontar`.
- **Dedo que no vuelve al reposo:** un dedo abajo se da por subido también cuando recupera el 60 % del recorrido que hizo (`RECUPERA_FRACCION`), con tope bajo el umbral de bajada (UMBRAL_BAJA − 4°) para que no se cuente doble. Antes quedaba en `sostenido` hasta "Fijar reposo". Pruebas nuevas; en la prueba de histéresis existente el valor intermedio pasó de 15° a 18° (con 15° ya recuperaba más del 60 % de 40°).
- **"Fijar reposo" dos veces en la calibración:** `inicioPausa` conserva el primer instante de pausa; antes el segundo toque lo sobrescribía y las notas volvían ya vencidas.
- **Mensaje final:** "¡Muy bien! Terminaste las notas" solo con al menos un acierto; sin aciertos, "Terminaste las notas".
- **Desfase:** `aprox: true` y la fórmula menciona 15–30 cuadros/s más la latencia del seguimiento.
- **e2e:** el primer toque al botón puede solo desbloquear el audio; la prueba toca hasta que silencia y comprueba por `estado().silencio`.
- Pendiente (no es mío): la descripción del PR sigue siendo la plantilla.
