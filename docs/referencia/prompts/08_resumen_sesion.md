# Prompt 8: resumen de sesión

Adjuntar: imagenes/08_resumen_sesion.png

---

Adjunto 08_resumen_sesion.png. Construye /sesion/:id/resumen.

- Anillo con agarres logrados / meta y etiqueta "Meta cumplida" o "Meta no alcanzada".
- Barras de agarres por mano, izquierda y derecha.
- Seis tarjetas: precisión, tiempo por agarre, apertura de pinza máxima, flexión del índice, suavidad y dolor reportado.
- Cada tarjeta muestra la diferencia contra la sesión anterior del mismo juego y nivel. Si no hay sesión anterior, no muestres diferencia.
- Al entrar a esta pantalla, cierra la sesión: calcula un hash SHA-256 con Web Crypto sobre el JSON canónico de la Sesion y sus eventos, guárdalo y marca la sesión como "cerrada". Desde aquí es inmutable.
- Botón "Ver mi progreso" a /progreso.
- Describe los datos sin interpretarlos clínicamente: nada de diagnósticos ni recomendaciones automáticas.
