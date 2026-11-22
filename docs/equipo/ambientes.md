# Ambientes: desarrollo y producción

Hay **dos ambientes completos y separados**, cada uno con su base de Supabase y su sitio en Vercel. El equipo desarrolla y
prueba contra **desarrollo**; **producción** es lo que se entrega y solo la tocan la CI (al unir a `main`) y la coordinación.

> Esto reemplaza lo que algunos documentos decían antes: «hay una sola base de datos y es la de producción». Ya no es así.

## 1. Los dos ambientes

| | **Desarrollo** (el equipo trabaja aquí) | **Producción** (lo que se entrega) |
|---|---|---|
| Supabase | proyecto `manoviva-dev` (`adpwhfcgssgpgomzoljm`) | proyecto `manoviva` (`iniposctftmzxkqasikh`) |
| Sitio | https://manoviva-dev.vercel.app | https://manoviva-sigma.vercel.app |
| Proyecto de Vercel | `manoviva-dev` | `manoviva` |
| Qué lo despliega | la CI, en cada push a `dev` (job `desplegar-dev`); cada PR tiene además su vista previa contra esta base (job `vista-previa`) | la CI, en cada push a `main` (job `desplegar`, después de `verificar`) |
| Contra qué base corren las pruebas | e2e, `verify:db` y scripts | ninguna prueba |
| Datos | ficticios; se pueden reiniciar | ficticios; son los que ve el jurado |
| `npm run db:seed` | se puede | **no**, salvo coordinación (una vez, al final) |
| Credenciales | `.env.dev` (se comparte con el equipo por canal privado) | `.env.prod` (solo coordinación) |

Los dos tienen las mismas migraciones y las mismas cuentas demo (`docs/manoviva-spec.md` §9).

## 2. Cómo se trabaja

```bash
# Una vez: guarda el .env.dev que te pasaron en la raíz del repositorio (está ignorado por git)
node scripts/entorno.mjs dev        # crea .env.local y .env.secrets desde .env.dev
node scripts/entorno.mjs --actual   # "ambiente actual: dev (…)": compruébalo antes de correr pruebas o scripts
bash init.sh                        # INIT OK
npm run dev                         # http://localhost:5174 contra la base de desarrollo
```

**Antes de cualquier prueba o script que escriba datos, corre `node scripts/entorno.mjs --actual`. Si dice `prod`, no sigas.**
Si no tienes `.env.dev`, también sirve copiar `.env.example` a `.env.local` y `.env.secrets` y completar los valores de desarrollo.

Un servidor `vite` que quedó abierto sigue usando la base con la que se levantó. Playwright y `npm run captura` **reutilizan** el servidor que ya esté
escuchando en su puerto: cierra los servidores viejos (o usa `E2E_PUERTO` / `CAPTURA_PUERTO` con un puerto libre) antes de correr pruebas.

## 3. Migraciones

Siguen las reglas de `contratos.md` §3 (aditivas, numeradas, revisadas por otra persona), y además:

1. Se aplican **primero a desarrollo**: `supabase link --project-ref adpwhfcgssgpgomzoljm` y `supabase db push --include-all`.
2. Llegan a **producción** cuando el cambio va a `main`: lo hace la coordinación (o P1) con `supabase link --project-ref iniposctftmzxkqasikh` y
   `supabase db push --include-all`, **antes** de que se despliegue el código que las necesita. Todavía no hay un job de la CI que lo haga.
3. Después de aplicar, **vuelve a enlazar** el CLI a desarrollo, para no dejarlo apuntando a producción.

Como el sitio de producción usa la base de producción, una migración que llegó a desarrollo pero no a producción no rompe nada mientras el
código que la necesita no esté en `main`. Por eso el PR que trae una migración debe decir si ya está aplicada en cada ambiente.

## 4. Secretos de la CI

En `Settings → Secrets and variables → Actions` (los nombres exactos están en `.github/workflows/ci.yml`):

| Secreto | Para qué |
|---|---|
| `DEV_SUPABASE_URL`, `DEV_SUPABASE_ANON_KEY`, `DEV_SUPABASE_SERVICE_ROLE_KEY` | e2e y `verify:db` contra desarrollo; build de la vista previa y del sitio de desarrollo |
| `VERCEL_ORG_ID`, `VERCEL_DEV_PROJECT_ID`, `VERCEL_DEV_TOKEN` (opcional: sin él usa `VERCEL_TOKEN`) | desplegar desarrollo y las vistas previas |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` | desplegar producción |

**Las claves de Supabase de producción no van a GitHub:** el build de producción usa las variables guardadas en el proyecto `manoviva` de Vercel.

## 5. Riesgos y límites

- Quien tiene `.env.dev` tiene la clave `service_role` de desarrollo: puede borrar esa base. Está pensado así; se arregla con `db:seed`.
- La política de seguridad (`vercel.json`) solo deja conectar con la base de producción. Los despliegues de desarrollo la cambian por la de
  desarrollo en la CI antes de publicar; si se despliega desarrollo a mano, hay que hacer el mismo reemplazo.
- El plan gratuito de Supabase pausa los proyectos tras unos días sin uso. Si desarrollo se pausa, se reactiva desde el panel.
- Las cuentas demo y su contraseña son públicas (están en el repositorio); los dos ambientes solo tienen datos ficticios.
- Al terminar el hackatón: rotar las claves de los dos proyectos y desactivar el registro público de Supabase Auth.
