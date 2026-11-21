# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21
- Última sesión: 2026-11-21, F03 acceso y roles → done.
- Feature en curso: ninguno.
- Recommended Next Step: **F04 — Inicio del paciente (Prompt 2)** (`node scripts/siguiente-feature.mjs` para el detalle).

## Archivos clave (Files)

- `src/App.tsx`: todas las rutas del spec §3. Cada pantalla es `React.lazy` (salvo `/acceso`) y vive en `src/screens/<area>/<Pantalla>.tsx` como provisoria (`EnConstruccion`); el comentario de la primera línea dice qué feature la construye. **Reemplazar el archivo, no cambiar la ruta.**
- `src/auth/contexto.ts`: `useAuth()` → `{ usuario, cargando, ingresar(datos), salir() }` e `inicioDe(rol)`. `src/auth/AuthProvider.tsx` escucha `repos.auth.alCambiar`. `src/auth/Protegida.tsx`: `Protegida` (sesión + rol + `Marco`), `SoloPublica` (/acceso con sesión → inicio del rol), `AlInicio`.
- `src/ui/Marco.tsx`: banner demo (si `usuario.demo`), `Suspense`, barra inferior según el rol (con punto de alertas abiertas). Las pantallas con barra deben usar `className="pantalla con-barra"`.
- `src/ui/piezas.tsx`: se agregaron `BannerDemo` y `EnConstruccion`. `avisar(texto, error?)` muestra avisos (`<Avisos />` ya montado en App).
- `src/data/repos.ts` exporta `repos` (instancia activa). Pantallas: `import { repos } from '../../data/repos'`.
- E2E: `playwright.config.ts` (vite propio en :5176, 390×844, es-CL, cámara falsa). `e2e/ayudas.ts`: `entrarComo(context, 'paciente'|'terapeuta')` inyecta la sesión demo, `vigilarErrores(page)` junta errores de consola. `e2e/smoke.spec.ts` es la base (28 pruebas).

## Acceso (F03, hecho)

- `src/screens/acceso/Acceso.tsx`: formulario real. Validación pura en `src/auth/codigo.ts` (`normalizarCodigo`, `codigoValido`, `errorCodigo`, `correoValido`). `?rol=&codigo=` prellena.
- `e2e/acceso.spec.ts` ingresa por la UI real (7 pruebas). Las demás suites siguen usando `entrarComo()` (sesión inyectada) para no gastar ingresos de Supabase Auth.
- Cerrar sesión usa `signOut({ scope: 'local' })`: ya no revoca la cuenta demo en otros dispositivos.
- Captura con formulario lleno: `npm run captura -- "/acceso?rol=paciente&codigo=CRM-4821" acceso-lleno --como nadie` (sin `--como nadie` la captura inyecta sesión y redirige).

## Para F04 (inicio del paciente)

- `/inicio` provisoria en `src/screens/paciente/Inicio.tsx`: reemplazar el archivo, usar `className="pantalla con-barra"` y datos vía `repos`.
- El smoke espera un `h1` con el título de cada ruta (`e2e/smoke.spec.ts`, lista `RUTAS_PACIENTE`): mantenerlo o ajustar.
- Si /inicio se ve vacío, `npm run db:seed` (las fechas del seed son relativas al día en que se corre).

## Cuidado con

- Correr `bash init.sh` antes de nada. Si `npm install` borró los binarios nativos de Windows, init.sh los repone.
- Vitest solo corre `src/**/*.test.ts(x)` (vite.config.ts); las pruebas de `e2e/` corren con `npm run e2e`.
- En `e2e/` los imports relativos llevan `.ts` (tsconfig.node.json usa nodenext).
- Git Bash convierte `/ruta` en ruta de Windows: `scripts/captura.mjs` lo deshace; para otros comandos usar `MSYS_NO_PATHCONV=1`.
- Pantallas siempre vía `repos`, no `supabase` directo.
- Fechas: el seed usa la fecha del día en que se corre. Si las vistas se ven vacías, `npm run db:seed`.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad, PWA instalada, modo avión, rendimiento.
- Medir con regla y goniómetro (docs/validacion.md, F21).

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK.
2. `node scripts/siguiente-feature.mjs` → F04.
3. Marcar F04 `in-progress` y seguir CLAUDE.md.
