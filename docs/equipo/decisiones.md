# Registro de decisiones del equipo

Una línea por decisión que afecte a otros. Se agrega al final; no se reescribe. Formato: `fecha · quién · qué · por qué`.

- 2026-11-21 · coordinación · Hoy es la fecha límite: se prioriza una demo estable sobre cantidad de juegos; lo que no llegue queda "Próximamente".
- 2026-11-21 · coordinación · Una sola base de Supabase (la de producción) para desarrollo, CI y demo; migraciones solo aditivas y numeradas por persona.
- 2026-11-21 · coordinación · Vercel se despliega desde la CI con token (el repositorio de la organización no se puede conectar a Vercel).
- 2026-11-21 · P2 · Convención de profundidad corregida tras prueba con cámara real: acercar la mano a la cámara la mete hacia el fondo de la mesa.
- 2026-11-21 · P3 · Torre: el cubo sostenido no baja de la altura de la silueta sobre la base (también al soltar), así no puede empujar ni derribar la torre; `caida` solo ocurre por física al soltar · revisión PR #19.
- 2026-11-21 · P3 · Torre: `metaAgarres` 0 = práctica libre (`desdePlan` devuelve 0, sin "Meta cumplida"); al completar la torre se rearma sola tras 1,5 s y la sesión termina solo por tiempo · revisión PR #19.
- 2026-11-21 · P3 · Torre: el desvío y la estabilidad se miden en cm de la escena (sin convertir con la calibración) y las fórmulas lo dicen ("aprox."); nivel 4 = "Cubos medianos, más precisión" (5 cubos medianos, tolerancia ajustada) · revisión PR #19.
