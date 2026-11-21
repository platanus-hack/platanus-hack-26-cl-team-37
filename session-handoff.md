# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21

- Última sesión: 2026-11-21, preparación del harness (F00 y F01 done).
- Feature en curso: ninguno.
- Recommended Next Step: **F02 — Esqueleto de la app** (`node scripts/siguiente-feature.mjs` para el detalle).

## Archivos clave (Files)

- `src/App.tsx` es una página provisoria "en construcción" que prueba la conexión a Supabase. F02 la reemplaza por el router.
- Ya existen y se reutilizan: `src/ui/piezas.tsx` (Encabezado, barras inferiores, Stepper, Segmentos, Interruptor, Anillo, Sparkline, Hoja, Dialogo, Avisos, estados), `src/ui/Icono.tsx`, `src/index.css` (tokens), `src/lib/formato.ts`, `src/data/*`, `src/domain/*`, `src/metrics/*`, `src/tracking/oneEuro.ts`, `src/games/registry.ts`.
- `src/ui/piezas.tsx` todavía no se usa en ninguna pantalla: revisarlo al construir F02 y ajustar lo que haga falta.

## Cuidado con

- Correr `bash init.sh` antes de nada. Si `npm install` borró los binarios nativos de Windows, init.sh los repone.
- Pantallas siempre vía `repos` (`src/data/repos.ts`), no `supabase` directo.
- Al agregar tipos de evento de un juego nuevo: migración que amplíe el `check` de `eventos_sesion.tipo`.
- Fechas: el seed usa la fecha del día en que se corre. Si las vistas se ven vacías ("sin sesiones esta semana"), correr `npm run db:seed`.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad, PWA instalada, modo avión, rendimiento.
- Medir con regla y goniómetro (docs/validacion.md, F21).

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK.
2. `node scripts/siguiente-feature.mjs` → F02.
3. Marcar F02 `in-progress` y seguir CLAUDE.md.
