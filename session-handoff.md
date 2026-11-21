# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21
- Última sesión: 2026-11-21, F06 preparar la sesión → done (deploy prod hecho, 200).
- Feature en curso: ninguno.
- Recommended Next Step: **F07 — Módulo de seguimiento de manos + distancia + fuentes simuladas** (`node scripts/siguiente-feature.mjs` para el detalle).

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

## Inicio del paciente (F04, hecho)

- `src/screens/paciente/Inicio.tsx`: carga con `useCarga(cargarInicio, [])` + `<Estados>`; datos = `repos.pacientes.miPaciente`, `planes.vigente`, `sesiones.listar`, `citas.proxima`.
- Funciones puras en `src/metrics/sesion.ts`: `planDeHoy(items, sesiones, hoy)` (hecho/siguiente/pendiente), `semana()` devuelve también `hechas`, `adherencia`, `racha`.
- `src/lib/useCarga.ts` (nuevo): `useCarga(fn, deps)` → `{ estado, datos, error, recargar }`, encaja con `Estados` de `ui/piezas`. Usarlo en las demás pantallas.
- "Siguiente" enlaza a `/sesion/<id del registro>/preparar` (p. ej. `/sesion/caja-juguetes/preparar`): F06 debe aceptar ese id de `src/games/registry.ts`.
- Mensaje del terapeuta: se marca visto al mostrarse. Para volver a verlo en la demo: `npm run db:seed`.
- e2e: `clienteComo('paciente')` en `e2e/ayudas.ts` da un cliente Supabase con la sesión demo (sin ingreso extra) para comparar contra la BD. Interceptar `**/rest/v1/<tabla>?*` con `page.route` sirve para probar vacío/error/carga.
- Clases nuevas en `src/index.css` (sección inicio): `.sin-vinetas`, `.icono-caja.apagado/.info`, `.ejercicio`, `.ejercicio-nombre/-detalle`, `.tira-semana`, `.punto-dia.cumplido/.pendiente/.futuro`.

## Catálogo de ejercicios (F05, hecho)

- `src/screens/paciente/Ejercicios.tsx`: `useCarga` (paciente → plan vigente + sesiones) + `<Estados>`; filtros en la URL `?gesto=Pinza|Agarre|Alcance`.
- `src/games/catalogo.ts`: `catalogo(juegos, items, sesiones, filtro)` y `nivelActual(juegoId, items, sesiones)` (plan > última sesión cerrada > 1), con pruebas en `catalogo.test.ts`.
- `src/games/Miniatura.tsx`: `<Miniatura clave={juego.miniatura} />` (SVG propio por juego). Reusarla en preparar/resumen si hace falta.
- Registro (`src/games/registry.ts`): ahora 8 juegos; `FILTROS`/`FiltroGesto`. Disponibles: `caja-juguetes` y `movilidad-guiada`. **Cada feature de juego (J1–J6) debe poner `disponible: true`** y el e2e `e2e/ejercicios.spec.ts` (constante `DISPONIBLES`) se actualiza a la par.
- Tarjeta disponible = `Link` a `/sesion/<id>/preparar`; Próximamente = `div aria-disabled`.

## Preparar la sesión (F06, hecho)

- `src/screens/sesion/Preparar.tsx`: `useCarga` (paciente → consentimiento, plan vigente, sesiones) + `<Estados>`. Lógica pura en `src/games/preparar.ts`: `valoresPorDefecto(juegoId, plan, manoAfectada, sesiones)` y `sesionPreparada(pacienteId, juegoId, prep)` → `repos.sesiones.crear(...)`.
- "Comenzar" navega a `/sesion/<S-AAAAMMDD-NN>/calibrar` **conservando `?fuente=`**. La sesión queda `estado: 'preparada'`, `parametros` = `{ mano, nivel, duracionMin, metaAgarres, metaPinzaCm, prescritoPor }` y `planVersion`; `inicio`, `calibracion`, `versionApp`, `dispositivo`, `versionModelo` = null (los llenan F08+ con `repos.sesiones.actualizar`).
- Sin consentimiento → `/privacidad` con `state.volver` (F18 debe volver ahí tras firmar).
- Registro: `NivelJuego.detalle` (texto por nivel); los juegos nuevos deben definirlo. `nivelDe(juegoId, n)` da tamaño/cantidad/distancia del nivel para el juego.
- e2e que crean sesiones: limpiar con `npx tsx scripts/limpiar-preparadas.ts <ISO desde>` (borra solo `preparada` de pacientes demo creadas desde esa fecha). Ver `e2e/preparar.spec.ts` (try/finally). F08 puede crear su sesión de prueba igual y limpiarla así — ojo: una sesión que pasó a `en curso` no la borra este script (ampliarlo o re-seed).
- Clases CSS nuevas (sección "preparar sesión"): `.preparar`, `.preparar-tarjeta`, `.preparar-valor`, `.niveles`, `.duracion`, `.boton-paso`, `.autor`, `.consejo`.

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
2. `node scripts/siguiente-feature.mjs` → F07.
3. Marcar F07 `in-progress` y seguir CLAUDE.md.
