# Bitácora P2

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · F33 tablero de features
- Qué: `scripts/tablero-features.mjs` (servidor local de solo lectura) + `scripts/tablero-features.html` (tabla ordenable, filtros por estado/dueño/texto, atajo "En desarrollo", grafo de dependencias con zoom y arrastre, detalle por feature, recarga manual/tecla R/auto 5 s).
- Probado: curl 200; Playwright con Chrome sin errores de consola.
- Pendiente: `npm run verify` no corre en mi máquina (node_modules con binarios de otra arquitectura); validar en la CI del PR y pasar F33 a done.
