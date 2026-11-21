# Bitácora P2

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · Arreglos tras prueba en teléfono (calibración y aviso de girar)
- Calibración en horizontal (`src/screens/sesion/calibrar.css`, nuevo): en teléfonos horizontales la app ya no queda en una columna de 520 px; indicaciones a la izquierda, chequeo a la derecha, marco al centro con toda la altura. El vertical no cambia.
- Pinza del paso 3 (`src/metrics/calibracion.ts`): las puntas 4 y 8 de MediaPipe no se superponen con los dedos juntos (quedan a 1,5–3 cm). Ahora basta ≤ 3 cm o ≤ 0,35 × palma, con 250 ms de tolerancia a cuadros con ruido; el consejo guía con "Casi: acerca un poco más las puntas".
- "Gira tu teléfono" (`Hud.tsx` + `girar.css`, nuevo): teléfono animado que gira a horizontal, texto más claro, botón principal "Pantalla completa y girar" y ayuda por bloqueo de rotación. Respeta movimiento reducido.
- Probado: `npm run verify` OK (220 unitarias, 5 nuevas de pinza); capturas con Supabase simulado en 844×390 y 390×844 sin errores y sin solapes del texto con el marco. Pendiente: e2e (sin `.env.local` en esta máquina, queda a la CI) y repetir la prueba en el teléfono.

## 2026-11-21 · F33 tablero de features
- Qué: `scripts/tablero-features.mjs` (servidor local de solo lectura) + `scripts/tablero-features.html` (tabla ordenable, filtros por estado/dueño/texto, atajo "En desarrollo", grafo de dependencias con zoom y arrastre, detalle por feature, recarga manual/tecla R/auto 5 s).
- Probado: curl 200; Playwright con Chrome sin errores de consola.
- Pendiente: `npm run verify` no corre en mi máquina (node_modules con binarios de otra arquitectura); validar en la CI del PR y pasar F33 a done.
