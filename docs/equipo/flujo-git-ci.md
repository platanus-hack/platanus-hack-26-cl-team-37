# Flujo de Git, CI/CD y reglas de la base de datos

## 1. Ramas y Pull Requests

- `main` es lo que se despliega. **Protegida: nadie empuja directo.**
- Cada persona trabaja en ramas cortas con su prefijo: `p1/ci`, `p2/prescripcion`, `p3/torre-cubos`.
  Una rama = una cosa. Vida máxima: unas horas. Hoy no hay ramas de larga duración.
- Commits: `feat(F17): …`, `fix(shell): …`, `chore(ci): …`, `docs(equipo): …`.
- **Antes de abrir el PR:** `git fetch && git rebase origin/dev`, luego `npm run verify` y los e2e de tu área.
- **Antes de unir el PR (también quien une un PR ajeno, persona o agente):** vuelve a traer su rama base, que es `dev` salvo en el PR `dev` → `main` (`git fetch origin && git merge origin/dev` en tu rama, o `gh pr update-branch <n>` en una ajena), corre `npm run verify` y únelo con `verificar` en verde sobre el commit actualizado. Como no exigimos "branch up to date", este paso es el que evita que dos PR verdes por separado rompan `dev` juntos.
- PR chico (idealmente < 400 líneas), con la plantilla de `.github/pull_request_template.md`. Se une con **squash**.
- Revisión: con **un visto bueno basta**, de otra persona.
  Un PR que solo toca lo tuyo y tiene la CI en verde se puede unir sin esperar horas: pide la revisión y avisa en el chat.
- Cuando se une tu PR, **borra la rama**.

### Configuración de GitHub (la hace quien es administrador)
`Settings → Branches → Add rule` para `main`:
- Require a pull request before merging (1 aprobación).
- Require status checks to pass: `verificar` (y `rama-base` en los PR a `main`). Las e2e no corren solas (§3), así que no se exigen como check.
- Do not allow force pushes; allow administrators to bypass (para emergencias).
- Automatically delete head branches.

Secretos de GitHub Actions: la lista y para qué sirve cada uno está en [`ambientes.md`](ambientes.md) §4. Las claves de Supabase de producción
no van a GitHub.

## 2. Claves y entornos locales

| Archivo | Contiene | Se comparte |
|---|---|---|
| `.env.dev` | todo lo de desarrollo (públicas y secretas) | **solo por canal privado**, a las personas del equipo |
| `.env.prod` | lo mismo de producción | **solo coordinación** |
| `.env.local` | URL y clave **anon** del ambiente activo (es pública: viaja en la app) | no: lo genera `node scripts/entorno.mjs dev` |
| `.env.secrets` | clave **service_role** (y contraseña de la base) del ambiente activo | no: lo genera el mismo script |

Todos están en `.gitignore`. Plantilla con los nombres: `.env.example`. La CI arma `.env.local` y `.env.secrets` de desarrollo desde los
secretos de GitHub en cada ejecución. Quien no aplica migraciones no necesita `SUPABASE_DB_PASSWORD`. Rotar las claves al terminar el hackatón.

## 3. CI (`.github/workflows/ci.yml`, la mantiene P1)

El archivo es la fuente de verdad; su encabezado explica cada job. Resumen:

| Job | Cuándo corre | Qué hace |
|---|---|---|
| `verificar` | siempre (PR y push a `dev`/`main`) | tipos, lint, unitarias y build, en paralelo. Sin claves. |
| `rama-base` | PR hacia `main` | rechaza el PR si no viene de `dev` (o de una rama `hotfix/…`). |
| `vista-previa` | cada PR (sin esperar a `verificar`) | despliega el PR en el proyecto de Vercel de desarrollo, contra la base de desarrollo, y comenta la URL en el PR. |
| `desplegar-dev` | push a `dev` (sin esperar a `verificar`) | despliega https://manoviva-dev.vercel.app y corre una prueba de humo. |
| `desplegar` | push a `main`, después de `verificar` | despliega producción (https://manoviva-sigma.vercel.app) y corre una prueba de humo. |
| `e2e`, `e2e-compartidas` | **solo a mano**: Actions → ci → Run workflow, o `gh workflow run ci --ref <rama>` | Playwright contra la base de **desarrollo**. `e2e-compartidas` agrupa las pruebas del paciente de prueba y la de uso sin conexión, una corrida a la vez. |

Criterios:
- **Sin claves en logs.** No imprimir variables; no usar `set -x` con secretos.
- Las e2e no se cancelan a mitad: una prueba cortada puede dejar datos de prueba sin limpiar.
- La CI reintenta **una vez** cada e2e (`--retries=1`); un fallo repetido es real.
- Hay una prueba lenta conocida (error de red con reintentos de `supabase-js`, hasta ~25 s); no bajes esos timeouts.
- Si una corrida deja datos de prueba sucios, límpialos con `npx tsx scripts/limpiar-prueba.ts` (ver comentarios del script) antes de reintentar.
- **Corre las e2e a mano antes de un PR `dev` → `main`**: hoy nada las corre solo.

## 4. CD: despliegue y base de datos

Vercel **no se puede conectar** a este repositorio de la organización, así que se despliega desde la CI con el CLI y un token (jobs de §3).
Producción usa las variables `VITE_*` guardadas en su proyecto de Vercel; desarrollo y las vistas previas reciben las de desarrollo en el build
y la CI cambia en `vercel.json` la base permitida por la política de seguridad. `.vercelignore` impide subir `.env*`, `docs/` y `scripts/`.

**Migraciones:** no hay job de la CI que las aplique. Se aplican a mano, primero a desarrollo y a producción cuando el cambio va a `main`, antes
de que se despliegue el código que las necesita ([`ambientes.md`](ambientes.md) §3). El archivo va en su PR y el PR dice dónde ya está aplicada.

## 5. Reglas de la base de desarrollo (compartida por todo el equipo)

Resumen operativo (el detalle está en `contratos.md` §3 y §5):
1. Antes de correr pruebas o scripts: `node scripts/entorno.mjs --actual` debe decir `dev`.
2. Migraciones aditivas y numeradas por persona; primero a desarrollo.
3. `db:seed` solo en desarrollo y avisando en el chat (reinicia los datos que los demás usan).
4. Pruebas limpian **por id explícito**.
5. No crear planes, alertas ni auditoría en pacientes demo desde pruebas.
6. Una persona a la vez corre las pruebas del paciente de prueba (§6).

## 6. Candado de las pruebas con estado compartido

Pruebas que usan `prueba.demo@example.com`: `csp`, `flujo-paciente`, `historial`, `offline`, `privacidad`, `sensacion`
(`grep -l "prueba" e2e/*.ts` da la lista vigente).

- Antes de correrlas **en tu computador**, escribe en el chat del equipo `🔒 prueba ON` y, al terminar, `🔓 prueba OFF`.
  Si alguien ya tiene el candado, espera o confía en la CI (que ya está serializada).
- Las demás (`caja`, `movilidad`, `pinza-fina`, `calibrar`, `preparar`, `shell`, juegos nuevos, etc.) crean sus propias sesiones con id único: se pueden correr cuando quieras.
- Si una prueba se corta a medias y deja datos de prueba, `npx tsx scripts/limpiar-prueba.ts` los borra; para restaurar la privacidad del paciente de prueba:
  `npx tsx scripts/prueba-privacidad.ts restaurar`.

## 7. Usar Claude Code

Cada persona puede abrir Claude Code en la raíz del repositorio: lee `CLAUDE.md` solo. Recuerda decirle tu rol ("soy P3, juegos nuevos") para que respete
las carpetas de §7 de `contratos.md`. No le des permiso para hacer `push` a `main`. Los permisos sugeridos están en `docs/harness/permisos-sugeridos.json`.

## 8. Orden recomendado de las primeras horas

1. P1 deja la CI mínima (§3, solo `verificar`) en los primeros 30 minutos para que los demás tengan feedback en sus PR.
2. P2 y P3 abren sus ramas desde `linea-*` y rebasan sobre `main`.
3. P1 suma `e2e` y el despliegue automático; hasta que estén, el despliegue lo hace P1 o coordinación a mano (`vercel deploy --prod --yes`).
4. Desde D − 3 h rige el calendario de `plan-de-hoy.md` §1.
