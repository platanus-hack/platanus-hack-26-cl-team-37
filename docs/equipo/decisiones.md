# Registro de decisiones del equipo

Una línea por decisión que afecte a otros. Se agrega al final; no se reescribe. Formato: `fecha · quién · qué · por qué`.

- 2026-11-21 · coordinación · Hoy es la fecha límite: se prioriza una demo estable sobre cantidad de juegos; lo que no llegue queda "Próximamente".
- 2026-11-21 · coordinación · Una sola base de Supabase (la de producción) para desarrollo, CI y demo; migraciones solo aditivas y numeradas por persona.
- 2026-11-21 · coordinación · Vercel se despliega desde la CI con token (el repositorio de la organización no se puede conectar a Vercel).
- 2026-11-21 · P2 · Convención de profundidad corregida tras prueba con cámara real: acercar la mano a la cámara la mete hacia el fondo de la mesa.
- 2026-11-21 · P1 · Sistema de diseño «Salud» (claro, tarjetas blancas planas, botón negro en píldora, el amarillo solo de relleno para lo que avanza, rojo para dolor, cifras en Archivo fino), hecho sobre referencias de empresas de salud reputadas y startups de YC. Se aplica por tokens en `src/index.css` con los nombres anteriores como alias; juego y calibración conservan su escena oscura. Reglas y porqués: artefacto «Design System» de ManoViva (Max lo comparte).
- 2026-11-21 · P3 · Exprime la naranja: la tarjeta de barras se dibuja en el lienzo 3D pero se calcula en píxeles CSS (≈210 px de ancho, letra de 14–15 px) y sin lista de pasos; así se lee en 844×390. Lo ideal sería un panel en DOM (`HudJuego.panel`), que queda como pedido futuro a P2.
- 2026-11-21 · P3 · Exprime la naranja: el tiempo sostenido se fija en el tiempo pedido al pasar al paso 4 (ya no suma con el puño cerrado); "Reiniciar" a mitad de una repetición emite `repeticion_incompleta` con su paso; textos visibles "Puño cerrado" y "Cierres" (nada que sugiera medir cuánto se aprieta).
- 2026-11-21 · P3 · Piano: en iOS el audio queda suspendido hasta un toque; el botón se ve silenciado mientras el contexto no corre y el toque lo desbloquea.
- 2026-11-21 · P3 · Piano: el botón de sonido vive dentro de `.juego` para quedar bajo la pausa y el aviso de girar el teléfono.
- 2026-11-21 · P3 · Piano: un dedo abajo se da por subido al recuperar el 60 % de su recorrido (tope bajo el umbral de bajada), para no perder notas si no vuelve a menos de 11° del reposo.
- 2026-11-21 · P3 · Piano: "Fijar reposo" repetido en la calibración conserva el primer instante de pausa; "Desfase" se marca aproximado (cámara 15–30 fps más latencia).
- 2026-11-21 · P3 · Torre: el cubo sostenido no baja de la altura de la silueta sobre la base (también al soltar), así no puede empujar ni derribar la torre; `caida` solo ocurre por física al soltar · revisión PR #19.
- 2026-11-21 · P3 · Torre: `metaAgarres` 0 = práctica libre (`desdePlan` devuelve 0, sin "Meta cumplida"); al completar la torre se rearma sola tras 1,5 s y la sesión termina solo por tiempo · revisión PR #19.
- 2026-11-21 · P3 · Torre: el desvío y la estabilidad se miden en cm de la escena (sin convertir con la calibración) y las fórmulas lo dicen ("aprox."); nivel 4 = "Cubos medianos, más precisión" (5 cubos medianos, tolerancia ajustada) · revisión PR #19.
- 2026-11-21 · P3 · Memoria de cartas: con `metaAgarres` 0 es práctica libre (sin meta, se arma otro tablero al completar); con meta > 0 la meta son los pares del nivel.
- 2026-11-21 · P3 · Memoria de cartas: el giro se desenrolla (±180°) antes de filtrar y los grados se rotulan "no validado" en las métricas visibles; "supinación/pronación máxima" pasan a "giro hacia palma arriba / hacia el otro lado (desde palma abajo)".
- 2026-11-21 · P3 · Memoria de cartas: `?sinMemoria=1` no vale con cámara real y, si se usó, el resumen guarda `sinMemoria` = 1 (sin tocar `ParametrosSesion`).
- 2026-11-21 · P2 · One Euro (issue #37): beta pasa de 0,02 a 10 (imagen) y 15 (mundo) en `camara.ts`, y de 0,01 a 0,2 en `distancia.ts`. El filtro ahora se adapta a la velocidad (retraso medido con mano sintética: 100 → 33 ms y 233 → 67 ms) a cambio de un temblor algo mayor en reposo (±0,42 → ±0,47 mm). Falta probar con cámara real; si el temblor real supera 1,5 mm, bajar beta.
- 2026-11-21 · P2 · Calibración: la pinza del paso 3 se acepta con puntas pulgar–índice ≤ 3 cm o ≤ 0,35 × palma (antes 2 cm), con 250 ms de tolerancia; en teléfono real los dedos juntos no bajaban de 2 cm.
