# Ambientes: desarrollo y producción

> **Esto reemplaza** lo que otros documentos de `docs/equipo/` decían sobre "una sola base de datos, que es producción".
> Desde ahora hay **dos ambientes completos y separados**. El equipo trabaja en `dev`; `prod` solo la toca la CI y la coordinación.

## 1. Los dos ambientes

| | **dev** (el equipo trabaja aquí) | **prod** (lo que se entrega) |
|---|---|---|
| Supabase | proyecto `manoviva-dev` (`adpwhfcgssgpgomzoljm`) | proyecto `manoviva` (`iniposctftmzxkqasikh`) |
| Sitio | https://manoviva-dev.vercel.app | https://manoviva-sigma.vercel.app |
| Proyecto Vercel | `manoviva-dev` | `manoviva` |
| Rama que lo alimenta | `ambiente-dev` (y los PR mientras se prueban) | `main` |
| Configuración de despliegue | `vercel.dev.json` (la política de seguridad apunta a la base dev) | `vercel.json` |
| Datos | demostración ficticios, se pueden reiniciar | demostración ficticios que se muestran en la entrega |
| ¿Se puede correr `npm run db:seed`? | **Sí**, cuando quieras | **No** (solo coordinación, una vez, a D − 30 min) |
| ¿Se pueden correr todas las pruebas e2e? | Sí (con el candado de las pruebas compartidas, `flujo-git-ci.md` §6) | No |
| Credenciales | `.env.dev` (se comparte con el equipo) | `.env.prod` (solo coordinación) |

Los dos tienen las mismas migraciones y las mismas cuentas demo (`docs/manoviva-spec.md` §9). Un cambio de esquema se prueba **primero en dev**
y llega a prod solo al unir a `main`.

## 2. Credenciales: qué se comparte y qué no

El equipo recibe **un solo archivo**, `.env.dev`, por un canal privado (nunca git, issues ni chats públicos). Trae:

| Variable | Para qué | ¿Secreta? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | correr la app en tu computador | No: viajan dentro de la app publicada |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | pruebas e2e y scripts (`db:seed`, limpiezas, `verify:db`) | **Sí**: da control total de la base **dev** |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | aplicar migraciones al dev con el CLI | **Sí** |
| `VERCEL_ORG_ID`, `VERCEL_DEV_PROJECT_ID` | solo la CI / quien despliega | No es secreto, pero no hace falta salvo para P1 |

**No se comparten con el equipo, nunca:** `.env.prod`, el token de Vercel, el token de acceso de Supabase ni la clave `service_role` de producción.
Como la clave `service_role` del equipo es la de **dev**, un error no toca lo que se entrega.

¿Quién necesita qué?

| Rol | Necesita |
|---|---|
| P2 y P3 | las 2 primeras filas (correr la app) y las 2 siguientes (pruebas y scripts). La contraseña de la base solo si aplican migraciones |
| P1 | todo `.env.dev`, más los secretos de GitHub Actions (`flujo-git-ci.md` §1); además un token de Vercel que crea el administrador |
| Coordinación | `.env.dev` y `.env.prod` |

## 3. Cómo se usa

```bash
# Una vez: guarda el .env.dev que te pasaron en la raíz del repositorio (está ignorado por git)
node scripts/entorno.mjs dev        # crea .env.local y .env.secrets desde .env.dev
node scripts/entorno.mjs --actual   # "ambiente actual: dev (…)" — compruébalo antes de correr pruebas
bash init.sh                        # INIT OK
npm run dev                         # http://localhost:5174 contra la base dev
npm run db:seed                     # solo en dev: deja los datos de demostración como nuevos
```

Antes de cualquier script que escriba datos, mira `node scripts/entorno.mjs --actual`: **si dice `prod`, no lo corras.**

Para aplicar una migración al dev: `supabase link --project-ref <ref de .env.dev> -p <contraseña>` y `supabase db push --include-all`.
Después **vuelve a enlazar** al proyecto que usabas, para no dejar el CLI apuntando al ambiente equivocado.

## 4. Despliegues

- **dev:** `VERCEL_ORG_ID=… VERCEL_PROJECT_ID=<VERCEL_DEV_PROJECT_ID> vercel deploy --prod --yes -A vercel.dev.json` (quien tenga sesión o token de Vercel).
  La CI puede hacerlo en cada push a la rama `ambiente-dev` con el mismo comando y los secretos de GitHub.
- **prod:** solo desde `main` (CI) o coordinación, con `vercel.json`.
- **Nunca unas `ambiente-dev` a `main`:** `vercel.dev.json` y los documentos de ambientes sí pueden pasar a `main`, pero la rama de despliegue de producción es `main`.

## 5. Qué cambia en las reglas del equipo

1. **Se desarrolla y se prueba contra dev.** La CI también: los secretos `SUPABASE_*` y `VITE_SUPABASE_*` de los jobs `verificar` y `e2e` son los de **dev**.
   Solo el job de migraciones de `main` usa los de prod.
2. **Migraciones:** se aplican a dev al desarrollarlas; a prod, al unir a `main`. Siguen siendo aditivas y con la numeración por persona (`contratos.md` §3), porque prod sigue siendo lo que se muestra.
3. **`db:seed` es libre en dev**; en prod, prohibido salvo coordinación (una vez).
4. **El candado de pruebas compartidas** (`flujo-git-ci.md` §6) sigue valiendo en dev: las tres personas comparten el mismo paciente de prueba de esa base.
5. **Si dev queda sucio o roto:** `node scripts/entorno.mjs dev && npm run db:seed` lo deja como nuevo; si el esquema se corrompe, se recrea el proyecto `manoviva-dev` y se vuelven a aplicar las migraciones (ya se probó desde cero).

## 6. Riesgos y límites

- **El plan gratuito de Supabase** pausa los proyectos tras ~7 días sin uso y limita el uso; para hoy no importa. Si el dev se pausa, se reactiva desde el panel.
- **El equipo tiene `service_role` de dev:** puede borrar o dañar esa base. Está pensado así; se arregla con `db:seed`.
- **Rotación:** al terminar el hackatón, rotar las claves de ambos proyectos y desactivar el registro público de Supabase Auth.
- **Las cuentas demo y su contraseña son públicas** (están en el repositorio); los dos ambientes solo tienen datos ficticios.
