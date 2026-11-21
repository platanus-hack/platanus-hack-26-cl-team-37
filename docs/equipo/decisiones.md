# Registro de decisiones del equipo

Una línea por decisión que afecte a otros. Se agrega al final; no se reescribe. Formato: `fecha · quién · qué · por qué`.

- 2026-11-21 · coordinación · Hoy es la fecha límite: se prioriza una demo estable sobre cantidad de juegos; lo que no llegue queda "Próximamente".
- 2026-11-21 · coordinación · Una sola base de Supabase (la de producción) para desarrollo, CI y demo; migraciones solo aditivas y numeradas por persona.
- 2026-11-21 · coordinación · Vercel se despliega desde la CI con token (el repositorio de la organización no se puede conectar a Vercel).
- 2026-11-21 · P2 · Convención de profundidad corregida tras prueba con cámara real: acercar la mano a la cámara la mete hacia el fondo de la mesa.
- 2026-11-21 · P3 · Exprime la naranja: la tarjeta de barras se dibuja en el lienzo 3D pero se calcula en píxeles CSS (≈210 px de ancho, letra de 14–15 px) y sin lista de pasos; así se lee en 844×390. Lo ideal sería un panel en DOM (`HudJuego.panel`), que queda como pedido futuro a P2.
- 2026-11-21 · P3 · Exprime la naranja: el tiempo sostenido se fija en el tiempo pedido al pasar al paso 4 (ya no suma con el puño cerrado); "Reiniciar" a mitad de una repetición emite `repeticion_incompleta` con su paso; textos visibles "Puño cerrado" y "Cierres" (nada que sugiera medir cuánto se aprieta).
