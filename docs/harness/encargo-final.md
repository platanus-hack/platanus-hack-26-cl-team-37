# Encargo del dueño (2026-11-21)

1. Construir la app completa: ir feature por feature de `feature_list.json` hasta que todos estén `done` o `blocked`. Luz verde dada; permisos activados en `.claude/settings.json`.
2. **Al final**, después de F28: hacer una presentación (PPT) para el hackatón con:
   - **Impacto**: el problema (rehabilitación de manos: adherencia baja en casa, terapeuta sin datos entre controles) y a quién ayuda.
   - **La solución**: ManoViva (juegos con cámara, métricas, plan del terapeuta, trazabilidad, privacidad). Usar capturas de `docs/capturas/`.
   - **Por qué es una solución de physical world**: mide movimiento real de la mano en el espacio físico con la cámara del teléfono (MediaPipe, distancia cámara–mano, cm y grados), sin sensores extra; el paciente manipula objetos virtuales con gestos reales; resultados que el terapeuta usa en la terapia presencial.
   - Usar la skill `anthropic-skills:pptx` (archivo .pptx en `docs/presentacion/`). Ser honesto con los límites (mediciones no validadas clínicamente aún).
