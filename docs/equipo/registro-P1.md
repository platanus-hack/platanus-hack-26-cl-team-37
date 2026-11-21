# Bitácora P1

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · F29 CI mínima (rama p1/ci)
- Qué: `.github/workflows/ci.yml` con el job `verificar` (npm ci, tipos, lint, unitarias, build) en cada PR y push a `main`, y el chequeo de dueños como paso informativo (rol por prefijo de rama). `package-lock.json` regenerado con `npm install --package-lock-only`: faltaban `@emnapi/core` y `@emnapi/runtime` y `npm ci` fallaba.
- Pruebas: los mismos pasos desde cero en Mac con Node 26: todo verde (lint con 1 aviso conocido en `src/ui/piezas.tsx`). La corrida real en Actions usa Node 22 (`.nvmrc`).
- Pendiente: jobs `e2e` y `desplegar` (necesitan los secretos de `flujo-git-ci.md` §1, que carga el administrador); protección de `main` con el check `verificar`; endurecer el lint y `.gitattributes` cuando se una el PR #1 (dueños de la configuración).
