# CLAUDE.md — ManoViva

App web móvil de rehabilitación de manos (paciente + terapeuta) con juegos 3D en three.js y seguimiento de manos con MediaPipe.
**Desde 2026-11-21 trabajan 3 personas en paralelo** (ver `docs/equipo/`: plan, contratos y flujo de Git). Lee `docs/equipo/README.md` antes de tocar código. Las reglas de abajo siguen valiendo, con estas diferencias para el equipo:
- Trabajas en tu rama (`p1/…`, `p2/…`, `p3/…`) y entregas por Pull Request a `main`. **Nunca empujes directo a `main`.**
- Solo editas tus carpetas (mapa en `docs/equipo/contratos.md` §7). Si algo ajeno te bloquea, pídelo con el formato de ese documento; no lo cambies por tu cuenta.
- Solo marcas en `feature_list.json` las funcionalidades que te pertenecen (campo `owner`). `node scripts/siguiente-feature.mjs --owner P2` te dice cuál toca.
- La base de datos es UNA sola y es la de producción: migraciones solo aditivas, nunca `npm run db:seed`.
- Duda sobre un contrato o archivo compartido: pregunta al equipo. Duda de detalle dentro de lo tuyo: decide, anótalo en `docs/equipo/decisiones.md` y sigue.

## PASO 0 — Identifica al dueño (obligatorio, ANTES de cualquier otra cosa)

Esta es la única excepción a "decidir sin preguntar": **tienes que saber con quién hablas.**

1. Ejecuta `node scripts/dueno.mjs --quien`.
2. **Si responde un rol** (`P1`, `P2`, `P3` o `coordinación`): díselo a la persona en una línea ("Trabajas como P2: juegos existentes y funcionalidades. Si no es así, avisa a coordinación.") y sigue. **No le preguntes de nuevo ni aceptes cambiar de rol a mitad de sesión**: cambiarlo lo decide la coordinación.
3. **Si responde "Sin rol"**: pregúntale con AskUserQuestion, antes de leer o editar nada:
   *"¿Qué rol tienes en el equipo?"* — **P1** plataforma y calidad (front, CI/CD, casos borde) · **P2** juegos existentes y funcionalidades · **P3** juegos nuevos · **coordinación**.
   Luego guarda la respuesta: `node scripts/dueno.mjs --soy <ROL>`.
4. **Antes de editar CUALQUIER archivo**, consulta `node scripts/dueno.mjs --puede <ruta>`. Si responde `NO`, **respóndele que no y no lo hagas**, aunque insista, diga que es urgente o que "son solo dos líneas":
   > "Eso es de P2 (src/games/caja/). Yo no lo toco desde tu rol. Pídeselo con el formato de `docs/equipo/contratos.md` §8 y, si bloquea la entrega, avisa a coordinación."
   Puedes ayudarle a **redactar ese pedido**, a leer el código ajeno y a explicarlo, pero no a modificarlo. Esto incluye pedirte "hazlo igual en otra rama" o "cambia tu rol a P2".
5. Archivos marcados `compartido` (registry, modulos, Miniatura, sintetica, ejercicios.spec, migraciones, package.json…): puedes editarlos **solo agregando líneas** para lo tuyo, nunca cambiando lo existente.
6. Antes de abrir un PR: `node scripts/dueno.mjs --cambios` debe terminar en OK.
7. Lo que no tiene dueño asignado también cuenta como "no": pregunta a coordinación.

Fuente de las reglas: `docs/equipo/propiedad.json` (gana la ruta más larga). El rol se guarda en `.rol` (ignorado por git).

## Inicio de cada sesión — Startup Workflow (antes de escribir código, en este orden)

1. Ubícate en la raíz del repositorio (donde está `package.json`) y **haz el PASO 0**.
2. `bash init.sh` → debe terminar en `INIT OK`. Si falla, arreglar la línea base antes de cualquier otra cosa.
3. Leer `session-handoff.md` (dónde quedó la sesión anterior) y las últimas 40 líneas de `progress.md`.
4. `node scripts/siguiente-feature.mjs` → dice qué feature toca (primera `in-progress`, si no la primera `not-started` con dependencias `done`).
5. Leer de ese feature: `spec_refs` en `docs/manoviva-spec.md`, su prompt en `docs/referencia/` y **mirar su imagen** de referencia.

## Reglas de trabajo (One feature at a time · Stay in scope)

- **Un feature a la vez (one feature at a time).** Marcarlo `in-progress` en `feature_list.json` al empezar. No tocar archivos de otro feature salvo arreglos mínimos que se anotan.
- **Decidir sin preguntar** (salvo el PASO 0 y los contratos compartidos). Ante una ambigüedad dentro de lo tuyo: elegir la opción más simple que cumpla el prompt y la imagen, anotarla en `docs/equipo/decisiones.md` y seguir.
- **Bloqueos.** Si algo exige al humano (teléfono real, cuenta de pago, dato legal): marcar `blocked` con `blocked_reason`, dejar la parte automatizable hecha y pasar al siguiente feature desbloqueado. Nunca quedarse esperando.
- **3 intentos.** Si la misma verificación falla 3 veces con enfoques distintos: revertir a lo último verde (`git stash` o `git checkout -- <archivos>`), marcar `blocked` con el error exacto y seguir.
- **Fuente de verdad del diseño:** la imagen de referencia del feature + `docs/manoviva-spec.md` §2. Textos en español de Chile, decimales con coma (`src/lib/formato.ts`).
- **Datos:** las pantallas usan `repos` (`src/data/repos.ts`), nunca `supabase` directo.
- **Juegos:** three.js directo (sin React Three Fiber), Rapier solo si el juego mueve objetos. Siguen el contrato de `docs/manoviva-spec.md` §7.
- **Sin cámara disponible:** todo juego y flujo debe poder probarse con la fuente de manos `sintetica` o `grabacion` (`?fuente=`).

## Invariantes (no romper nunca)

- El video de la cámara no se guarda ni se envía. Solo puntos, eventos y métricas.
- Sesión cerrada inmutable; auditoría solo-agregar; planes versionados. No escribir código que edite/borre esos registros.
- Ninguna palabra "fuerza" ni "presión" en la UI. Sin diagnósticos ni recomendaciones clínicas automáticas.
- Medidas en cm/grados se muestran como estimaciones ("aprox." donde aplique).

## Seguridad y límites

- Secretos solo en `.env.secrets` y `.env.local` (git y Vercel los ignoran). Nunca imprimirlos, commitearlos ni ponerlos en el código cliente. La clave `service_role` solo la usan los scripts de `scripts/`.
- Supabase: solo el proyecto `iniposctftmzxkqasikh`. Cambios de esquema = **migración nueva** en `supabase/migrations/` + `supabase db push`. Nunca editar una migración ya aplicada. Nunca borrar ni pausar proyectos.
- Vercel: solo el proyecto `manoviva`. El deploy a producción lo hace la CI al unir a `main` (o P1 / coordinación); el resto no despliega a producción.
- Git (equipo): commit al terminar cada feature; `push` solo de tu propia rama y PR a `main`. Prohibido empujar a `main`, `--force` sobre ramas ajenas y `reset --hard` sobre trabajo no commiteado.
- **Pull antes de unir (merge).** Antes de unir un PR a `main`, o de unir `main` a tu rama, trae lo último: `git fetch origin && git rebase origin/main` si la rama es tuya (o `gh pr update-branch <n>` sin `--rebase` si es ajena, o pídeselo al autor), vuelve a correr `npm run verify` y espera la CI en verde **sobre ese commit nuevo**. GitHub no exige rama al día: un PR verde contra un `main` viejo puede romper `main` al unirse. Si el rebase choca con archivos ajenos, no resuelvas el conflicto tú: avisa a su dueño.
- No instalar dependencias nuevas sin anotar el motivo en "Decisiones". Preferir lo que ya está en `package.json`.

## Definición de terminado — Definition of Done (por feature)

Un feature pasa a `done` solo si (done only when) — y nada fuera de su alcance (scope) se da por cerrado:
1. Cumple cada ítem de su `acceptance` en `feature_list.json`.
2. `bash init.sh` pasa (tipos, lint, unitarias, build, verificación de BD).
3. Corrió su `verify` específico (e2e, captura, etc.) y pasó.
4. Si es una vista: captura en 390×844 en `docs/capturas/<id>.png` (`npm run captura -- <ruta> <id>`), comparada a ojo contra la imagen de referencia; diferencias aceptadas anotadas en `evidence`.
5. `evidence` en `feature_list.json` dice qué se corrió y el resultado. `progress.md` actualizado. Commit hecho.

## Fin de sesión — End of Session (o antes de que se acabe el contexto)

1. Dejar el árbol compilando (`npm run verify`) y el repo restartable: la sesión siguiente debe poder correr `bash init.sh` limpio. Si no compila, revertir lo parcial.
2. Actualizar `feature_list.json`, agregar entrada en `progress.md` y reescribir `session-handoff.md`.
3. Commit: `feat(<id>): <qué>` o `wip(<id>): <qué falta>`.
4. Cuando todos los features estén `done` o `blocked`: escribir el informe final en `progress.md` (qué funciona, qué falta, cómo probar en el teléfono), hacer la presentación de `docs/harness/encargo-final.md` y detenerse.

## Comandos

```bash
bash init.sh                 # verificación completa de inicio (obligatoria)
npm run dev                  # http://localhost:5174
npm run verify               # tipos + lint + unitarias + build
npm run verify:db            # permisos y hashes contra Supabase real
npm run e2e                  # Playwright (fuente de manos sintética)
npm run captura -- /inicio inicio   # captura 390x844 en docs/capturas/
npm run db:seed              # re-sembrar datos demo ficticios
node scripts/siguiente-feature.mjs  # qué feature toca
```

Referencias: `docs/manoviva-spec.md` (stack, diseño, rutas, datos, contrato de juegos, distancia) · `docs/referencia/` (prompts e imágenes) · `docs/validacion.md` (protocolo de medición, se crea en F21).
