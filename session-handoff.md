# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `bash init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21 (el dueño detuvo el trabajo para mover el proyecto a otro repositorio; se retoma después).
- Terminadas y unidas a `master`: F00–F16, F18, F20 y los juegos Caja (F10), Movilidad (F11) y Pinza fina (F23). Producción: https://manoviva-sigma.vercel.app (último deploy con F15, F18 y la corrección de profundidad; faltan por publicar F23 y lo que venga).
- Recommended Next Step: retomar las 4 líneas detenidas (cada una tiene un commit `wip` en su rama `linea-X`, trabajo a medias):

| Rama | Feature | Estado |
|---|---|---|
| `linea-G` | F17 Prescripción del plan | pantalla, lógica de edición y e2e a medias; migración 700001 ya aplicada a la base |
| `linea-H` | F19 Perfil del paciente | pantalla, validación y e2e a medias; migración 800001 ya aplicada a la base |
| `linea-I` | F22 Torre de cubos | `src/games/torre/` recién empezado |
| `linea-J` | F24 Atrapa burbujas | `src/games/burbujas/` recién empezado |

  Las copias de trabajo están en `../lineas/<G|H|I|J>` (con su `node_modules`). Revisar cada rama (`git log`, `git diff master...linea-X`), terminar el feature con las reglas de `CLAUDE.md`, unir a master y registrar evidencia en `feature_list.json`/`progress.md`. Las migraciones 700001 y 800001 ya están copiadas en `master`.
- Después: F21 (pruebas y validación, necesita F17 y F20), juegos F25 Exprime la naranja, F26 Memoria de cartas, F27 Piano de dedos, F28 cierre + informe final, y la presentación (`docs/harness/encargo-final.md`).

## Cómo se trabaja en paralelo (líneas)

- `bash scripts/crear-linea.sh <nombre-nuevo>` crea `../lineas/<nombre>` (rama `linea-<nombre>` desde master, con `node_modules` copiado y archivos de claves). El nombre debe ser nuevo. No usar `git worktree remove` sobre una línea con node_modules (falla); las carpetas viejas `../lineas/A` … `J` pueden borrarse a mano cuando ya estén unidas (`lineas/B` tiene unos restos que no se pudieron borrar).
- Cada agente usa sus propios puertos: `E2E_PUERTO=<n>` y `CAPTURA_PUERTO=<n+1>`; no edita `feature_list.json`, `progress.md` ni este archivo (lo hace el coordinador al unir); CSS en archivos propios; migraciones con rango propio y `supabase db push --include-all`.
- Con varias líneas activas el e2e de juegos con física falla a veces por carga: repetir solo, con `--workers=1`.

## Archivos clave (Files)

- Contrato de juegos: `src/games/shell/contrato.ts`; ejemplos: `src/games/caja/` (física), `src/games/pinza/` (sin física), `src/games/movilidad/`. Registro `src/games/registry.ts`; `src/games/shell/modulos.ts`.
- Seguimiento y fuentes simuladas (`?fuente=sintetica`): `src/tracking/`; `src/tracking/sintetica.ts` (campo `pinzaDedo`).
- Mapeo mano → escena: `src/games/shell/manos3d.ts`. **Convención corregida tras la prueba con cámara real: acercar la mano a la cámara la mete hacia el fondo de la mesa** (`ZONA_BASE.z = [-0.9, 0.9]`).
- Datos: `src/data/` (`repos.ts` envuelto por `sinConexion.ts`, que sirve la última lectura sin red y devuelve listas vacías si no hay copia). Eventos de todos los juegos permitidos en BD por la migración 20261121400001.
- Paciente de prueba para e2e que cierran sesiones: `prueba.demo@example.com` (oculto al terapeuta). Helpers en `e2e/ayudas.ts`; limpieza con `scripts/limpiar-prueba.ts`; restaurar su privacidad con `npx tsx scripts/prueba-privacidad.ts restaurar`.
- Pasos para probar en el teléfono: `docs/telefono.md`. Red y CSP: `docs/privacidad-red.md`.

## Cuidado con

- `bash init.sh` primero. `init.sh` repone los binarios nativos de Windows (Node 20.17 < 20.19).
- Pantallas siempre vía `repos`. No tocar `colaLocal.ts` ni `supabaseRepos.ts` sin cuidado (las líneas chocan ahí al unir).
- Las claves están en `.env.local` y `.env.secrets` (ignorados por git). **No subirlas a ningún repositorio.**
- Pruebas con cámara real: solo una del dueño en computador (se corrigió la profundidad). Pendiente: izquierda/derecha reales, teléfono, instalación PWA, modo avión.
- Pinza fina: mano más chica y baja que la referencia; sin prueba con mano izquierda.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad, PWA instalada, modo avión, rendimiento, sensación del agarre.
- Medir con regla y goniómetro (docs/validacion.md, F21).
- Redactar el texto legal real del consentimiento (`src/legal/consentimiento-v1.md` es provisorio) y revisión legal antes de usar con pacientes.
- Desactivar el registro público de Supabase Auth antes de uso real.

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK.
2. `git worktree list` y revisar las ramas `linea-G`..`linea-J` (commits `wip`).
3. Terminar F17 y F19, unir; luego F21 y los juegos restantes.
