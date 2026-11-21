# ManoViva — progreso

Registro de sesiones (solo agregar al final). Cada entrada: fecha, feature, qué se hizo (What), verificación con resultado (Evidence), siguiente paso (Next).

## Estado actual (Current State)

- Last Updated: 2026-11-21
- Hecho: F00 base, F01 harness, F02 esqueleto (rutas, sesión, roles, barras, e2e). Pantallas provisorias con título. El deploy sigue siendo la página provisoria de F00 (F02 no despliega).
- Siguiente (Next): F03 acceso y roles. Ver `session-handoff.md`.

## Decisiones

Ambigüedades resueltas sin el dueño. Agregar aquí, con fecha y motivo.

- 2026-11-21 · Supabase es la fuente de verdad (el Prompt 0 pedía IndexedDB primero). IndexedDB queda como cola de escrituras pendientes. Motivo: el dueño pidió montarlo en Supabase y Vercel.
- 2026-11-21 · Autenticación real con correo y contraseña además de rol y código de clínica (el diseño solo muestra rol y código). Se agrega "Entrar con cuenta demo" para que la demo se use con un toque.
- 2026-11-21 · Juegos en three.js directo, sin React Three Fiber (pedido del dueño). Física con `@dimforge/rapier3d-compat` solo en juegos que mueven objetos.
- 2026-11-21 · Distancia cámara–mano: ajuste de perspectiva débil con worldLandmarks de MediaPipe, sin modelos extra (ver spec §6).
- 2026-11-21 · Se agrega el ejercicio "Movilidad guiada" (calentamiento) porque el diseño de Inicio y el plan demo lo incluyen; no está en los prompts.
- 2026-11-21 · Adherencia: sesiones planificadas por semana = días de práctica × ejercicios del plan.
- 2026-11-21 · Flexión de un dedo = flexión MCP + PIP (la DIP de MediaPipe es más ruidosa). Suavidad = SPARC por segmento de traslado, escala 0–100 entre −6 y −1,6.
- 2026-11-21 · ID de sesión correlativo global por día (RPC con lock), porque `S-AAAAMMDD-NN` es la clave primaria.
- 2026-11-21 · `reset_demo()` puede borrar auditoría solo de datos demo y solo con service_role, para que el seed sea re-ejecutable.
- 2026-11-21 · (F02) Rutas por rol: `/historial` y `/historial/:id` aceptan paciente y terapeuta (spec: "terapeuta vía paciente"); la barra inferior se elige según el rol. `/depuracion` acepta ambos, sin barra.
- 2026-11-21 · (F02) Con barra: /inicio, /ejercicios, /progreso, /historial(/:id), /perfil y las 4 pestañas del terapeuta. Sin barra: flujo /sesion/*, /privacidad (se llega desde Perfil, imagen 13 sin barra), /terapeuta/pacientes/:id/plan (imagen 12 sin barra). /sesion/:id/jugar además sin banner (pantalla completa horizontal).
- 2026-11-21 · (F02) Banner "Datos de demostración ficticios" (franja azul arriba) solo si el perfil tiene `demo = true`; no está en las imágenes, lo pide F02.
- 2026-11-21 · (F02) Rol equivocado → inicio del propio rol con aviso de error; ruta desconocida o "/" → inicio del rol o /acceso. /acceso con sesión abierta → inicio del rol (ignora `state.desde`; F03 puede usarlo).
- 2026-11-21 · (F02) Pantallas con `React.lazy` (salvo /acceso) para que three.js/MediaPipe de los juegos no carguen en el inicio.
- 2026-11-21 · (F02) Perfil provisorio con "Cerrar sesión" para poder probar el ciclo de sesión antes de F19.
- 2026-11-21 · (F02) Playwright levanta su propio vite en :5176 (5174 = dev, 5175 = captura). La sesión e2e se inyecta en localStorage `manoviva-auth` una vez por pestaña (sessionStorage como marca) para que "cerrar sesión" se pueda probar. vitest se limita a `src/**/*.test.ts`; `e2e/` y `playwright.config.ts` se tipan con tsconfig.node.json.

## Riesgos abiertos

- Node local 20.17 < 20.19 que pide Vite 8: `init.sh` reinstala binarios nativos de Windows. Arreglo definitivo: instalar Node 22 LTS.
- Registro público de Supabase Auth sigue activo: un extraño puede crear cuenta, pero sin perfil no ve datos (RLS). Desactivar en el panel de Supabase (Auth > Providers > Email > "Allow new users to sign up") antes de uso real.
- Lateralidad izquierda/derecha, instalación PWA y modo avión solo se pueden confirmar en un teléfono real.
- Medidas en cm y grados no validadas contra regla/goniómetro hasta que un humano ejecute docs/validacion.md (F21).
- `repos.auth.salir()` usa `supabase.auth.signOut()` con alcance global por defecto: cerrar sesión en un dispositivo (o en la prueba e2e de F02) revoca los refresh tokens de esa cuenta demo en todos lados. Las pruebas no fallan porque el access token dura 1 h. Si molesta, cambiar a `signOut({ scope: 'local' })` (F19).

## Sesiones

### 2026-11-21 · F00 Base
- Proyecto Vite + React + TS en `manoviva/`. Supabase `manoviva` (São Paulo): 3 migraciones (esquema con RLS, triggers de inmutabilidad, RPCs; id de sesión; reset demo).
- Datos demo ficticios: 1 terapeuta, 4 pacientes, 42 sesiones con eventos y hash.
- Métricas puras: geometría (flexión, pinza, largo, distancia pinhole, luz), agarre con histéresis, SPARC, agregados, adherencia, racha, semana; One Euro; integridad SHA-256 canónica.
- Capa de datos: `repos.ts` + `supabaseRepos.ts` + cola Dexie. Estilos y piezas de UI base. Registro de juegos.
- Deploy provisorio: https://manoviva-sigma.vercel.app (página "en construcción").
- Verificación: `npm test` 25/25 · `npm run verify:db` 14/14 · build OK · deploy 200.

### 2026-11-21 · F01 Spec y harness
- `docs/manoviva-spec.md`, `CLAUDE.md`, `feature_list.json` (29 features), `init.sh`, `session-handoff.md`, `scripts/siguiente-feature.mjs`, `scripts/captura.mjs`. Permisos propuestos para trabajo autónomo en `docs/harness/permisos-sugeridos.json` (inactivos: activarlos es decisión del dueño).
- Material de referencia copiado a `docs/referencia/` (prompts 00–15, J0–J6, imágenes).
- Dependencias: se quitan @react-three/*; se agrega @dimforge/rapier3d-compat.
- Siguiente: F02.

### 2026-11-21 · F02 Esqueleto de la app
- Router (`src/App.tsx`) con las 19 rutas del spec §3, `AuthProvider` + `useAuth` sobre `repos.auth` (`src/auth/`), guardas `Protegida`/`SoloPublica`/`AlInicio`, `Marco` (banner demo + barra según rol + punto de alertas abiertas), `Avisos` global.
- `repos` exportado desde `src/data/repos.ts` (implementación activa = supabaseRepos).
- Pantallas provisorias en `src/screens/<area>/` (una por ruta, cada una dice qué feature la construye) con `EnConstruccion` de `src/ui/piezas.tsx`.
- `playwright.config.ts` + `e2e/ayudas.ts` (entrarComo, vigilarErrores) + `e2e/smoke.spec.ts`.
- Verificación: `npm run e2e -- smoke` 28/28 · `npm run captura -- /acceso esqueleto` OK · `bash init.sh` INIT OK.
- Siguiente: F03.
