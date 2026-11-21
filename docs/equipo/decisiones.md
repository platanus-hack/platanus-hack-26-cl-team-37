# Registro de decisiones del equipo

Una línea por decisión que afecte a otros. Se agrega al final; no se reescribe. Formato: `fecha · quién · qué · por qué`.

- 2026-11-21 · coordinación · Hoy es la fecha límite: se prioriza una demo estable sobre cantidad de juegos; lo que no llegue queda "Próximamente".
- 2026-11-21 · coordinación · Una sola base de Supabase (la de producción) para desarrollo, CI y demo; migraciones solo aditivas y numeradas por persona.
- 2026-11-21 · coordinación · Vercel se despliega desde la CI con token (el repositorio de la organización no se puede conectar a Vercel).
- 2026-11-21 · P2 · Convención de profundidad corregida tras prueba con cámara real: acercar la mano a la cámara la mete hacia el fondo de la mesa.
- 2026-11-21 · P3 · Atrapa burbujas: el alcance máximo sale solo de las burbujas reventadas y de las manos de la sesión (el reposo se recalcula al reaparecer la mano); la otra mano no revienta burbujas (como movilidad).
- 2026-11-21 · P3 · Atrapa burbujas: "Tiempo de reacción" pasa a "Tiempo por burbuja" (id y clave `tiempoBurbuja`); Aciertos % cuenta como fallo solo la burbuja que nunca se reventó.
- 2026-11-21 · P3 → P2 · Atrapa burbujas lee `zona` y `umbralExtensionPct` del plan, pero no están en `ParametrosSesion` ni en el editor de planes: hoy rigen los valores por defecto (detalle en registro-P3.md).
