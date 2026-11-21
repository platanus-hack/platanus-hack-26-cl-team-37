# Flujo de Git, CI/CD y reglas de la base compartida

## 1. Ramas y Pull Requests

- `main` es lo que se despliega. **Protegida: nadie empuja directo.**
- Cada persona trabaja en ramas cortas con su prefijo: `p1/ci`, `p2/prescripcion`, `p3/torre-cubos`.
  Una rama = una cosa. Vida máxima: unas horas. Hoy no hay ramas de larga duración.
- Commits: `feat(F17): …`, `fix(shell): …`, `chore(ci): …`, `docs(equipo): …`.
- **Antes de abrir el PR:** `git fetch && git rebase origin/main`, luego `npm run verify` y los e2e de tu área.
- PR chico (idealmente < 400 líneas), con la plantilla de `.github/pull_request_template.md`. Se une con **squash**.
- Revisión: con **un visto bueno basta**, de otra persona. Los archivos con dueño (CODEOWNERS) piden el visto bueno de su dueño.
  Un PR que solo toca lo tuyo y tiene la CI en verde se puede unir sin esperar horas: pide la revisión y avisa en el chat.
- Cuando se une tu PR, **borra la rama**.

### Configuración de GitHub (la hace quien es administrador)
`Settings → Branches → Add rule` para `main`:
- Require a pull request before merging (1 aprobación; "Require review from Code Owners").
- Require status checks to pass: `verificar` y `e2e` (los nombres de los jobs de §3), sin exigir "branch up to date" para no frenar el día.
- Do not allow force pushes; allow administrators to bypass (para emergencias).
- Automatically delete head branches.

`Settings → Secrets and variables → Actions` (nombres exactos, valores solo del administrador):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (los dos últimos están en `.vercel/project.json` del equipo del dueño).

## 2. Claves y entornos locales

| Archivo | Contiene | Se comparte |
|---|---|---|
| `.env.local` | URL y clave **anon** de Supabase (es pública: viaja en la app) | por el canal del equipo |
| `.env.secrets` | clave **service_role** y contraseña de la base | **solo por canal privado**, solo a las 3 personas; rotar al terminar el hackatón |

Ambos están en `.gitignore`. Plantilla con los nombres: `.env.example`. La CI los recrea desde los secretos de GitHub en cada ejecución.
Quien no aplica migraciones no necesita `SUPABASE_DB_PASSWORD`.

## 3. CI (la construye P1)

Archivo `.github/workflows/ci.yml`, en cada PR y en cada push a `main`. Node 22, `npm ci`, caché de npm. Esqueleto de referencia (verificar antes de confiar):

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  verificar:                         # rápido, sin base de datos
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
  e2e:                               # con la base compartida, UNO A LA VEZ en todo el repositorio
    needs: verificar
    runs-on: ubuntu-latest
    concurrency: { group: e2e-supabase, cancel-in-progress: false }
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Crear archivos de entorno desde secretos
        run: |
          printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n' "${{ secrets.VITE_SUPABASE_URL }}" "${{ secrets.VITE_SUPABASE_ANON_KEY }}" > .env.local
          printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "${{ secrets.SUPABASE_URL }}" "${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" > .env.secrets
      - run: npm run verify:db
      - run: npx playwright test --workers=2
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: "test-results/" }
```

Criterios de la CI:
- **Sin claves en logs.** No imprimir variables; no usar `set -x` con secretos.
- El job `e2e` no se cancela a mitad (`cancel-in-progress: false`): una prueba cortada puede dejar datos de prueba sin limpiar.
- Si un e2e falla por carga, la CI lo reintenta **una vez** (`--retries=1`); un fallo repetido es real.
- Hay una prueba lenta conocida (error de red con reintentos de `supabase-js`, hasta ~25 s); no bajes esos timeouts.
- Si el job `e2e` deja datos de prueba sucios, límpialos con `npx tsx scripts/limpiar-prueba.ts` (ver comentarios del script) antes de reintentar.

## 4. CD: despliegue y base de datos (la construye P1)

Vercel **no se puede conectar** a este repositorio de la organización, así que se despliega desde la CI con el CLI y un token.
Job en `main`, después de `verificar` y `e2e`:

```yaml
  desplegar:
    needs: [verificar, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    env: { VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}, VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }} }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx vercel deploy --prod --yes --token ${{ secrets.VERCEL_TOKEN }}
      - name: Prueba de humo
        run: |
          curl -fsS -o /dev/null https://manoviva-sigma.vercel.app/
          curl -fsS -o /dev/null https://manoviva-sigma.vercel.app/manifest.webmanifest
          curl -fsSI https://manoviva-sigma.vercel.app/ | grep -i '^content-security-policy'
```

Las variables `VITE_*` ya están guardadas en el proyecto de Vercel. `.vercelignore` impide subir `.env*`, `docs/` y `scripts/`.

**Migraciones:** un job aparte (solo si cambió algo en `supabase/migrations/`) corre `npx supabase link --project-ref iniposctftmzxkqasikh` y
`npx supabase db push --include-all`, **antes** de desplegar la app que las necesita. Mientras ese job no exista, quien aplica una migración
la aplica a mano (`supabase db push --include-all`) y lo avisa en el chat; el archivo va en su PR.

## 5. Reglas de la base compartida

Es **producción**. Resumen operativo (el detalle está en `contratos.md` §3 y §5):
1. Migraciones aditivas y numeradas por persona.
2. Nunca `db:seed`.
3. Pruebas limpian **por id explícito**.
4. No crear planes, alertas ni auditoría en pacientes demo desde pruebas.
5. Una persona a la vez corre las pruebas del paciente de prueba (§6).

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
