# CLAUDE.md — ManoViva

App web móvil de rehabilitación de manos (paciente + terapeuta) con juegos 3D en three.js y seguimiento de manos con MediaPipe.
Se construye **de forma autónoma**: el dueño no está disponible para responder. Decide, anota y sigue.

## Inicio de cada sesión — Startup Workflow (antes de escribir código, en este orden)

1. `pwd` debe terminar en `app hackaton/manoviva`. Si no, `cd` ahí.
2. `bash init.sh` → debe terminar en `INIT OK`. Si falla, arreglar la línea base antes de cualquier otra cosa.
3. Leer `session-handoff.md` (dónde quedó la sesión anterior) y las últimas 40 líneas de `progress.md`.
4. `node scripts/siguiente-feature.mjs` → dice qué feature toca (primera `in-progress`, si no la primera `not-started` con dependencias `done`).
5. Leer de ese feature: `spec_refs` en `docs/manoviva-spec.md`, su prompt en `docs/referencia/` y **mirar su imagen** de referencia.

## Reglas de trabajo (One feature at a time · Stay in scope)

- **Un feature a la vez (one feature at a time).** Marcarlo `in-progress` en `feature_list.json` al empezar. No tocar archivos de otro feature salvo arreglos mínimos que se anotan.
- **Decidir sin preguntar.** Ante una ambigüedad: elegir la opción más simple que cumpla el prompt y la imagen, anotarla en `progress.md` bajo "Decisiones" y seguir. No usar AskUserQuestion.
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
- Vercel: solo el proyecto `manoviva`. `vercel deploy --prod --yes` está permitido al cerrar cada fase (ver `feature_list.json`, campo `deploy`).
- Git: solo local. Commit al terminar cada feature. Prohibido `push`, `--force`, `reset --hard` sobre trabajo no commiteado de otro feature.
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
