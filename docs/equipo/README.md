# Equipo ManoViva — cómo trabajamos hoy

Hoy es la fecha límite del hackatón. Somos 3 personas más coordinación, sobre una base de código que ya funciona
(ver `session-handoff.md`). El objetivo del día es **entregar una demo que no se caiga**, no sumar todo lo posible.

## Roles

| Rol | Foco | Quién (usuario de GitHub) |
|---|---|---|
| **P1 · Plataforma y calidad** | Front, CI/CD y casos borde | _completar_ |
| **P2 · Juegos existentes y funcionalidades** | Mejorar Caja, Movilidad y Pinza fina; terminar prescripción, perfil y diagnóstico | _completar_ |
| **P3 · Juegos nuevos** | Torre de cubos, Atrapa burbujas, Exprime la naranja, Piano de dedos, Memoria de cartas | _completar_ |
| **Coordinación** | Ficha de entrega, presentación, regresión final, resolver dudas de contratos | Martín + Claude |

## Qué leer, en este orden (15 minutos)

1. Este archivo.
2. [`ambientes.md`](ambientes.md): los dos ambientes (dev y prod) y qué credenciales recibes.
3. [`plan-de-hoy.md`](plan-de-hoy.md): qué hace cada persona hoy, en qué orden, y cuándo se congela todo.
4. [`contratos.md`](contratos.md): lo que **no se puede cambiar sin avisar** y cómo pedir cambios a otro rol.
5. [`flujo-git-ci.md`](flujo-git-ci.md): ramas, Pull Requests, CI/CD, claves y reglas de la base de datos compartida.
6. `CLAUDE.md` y `session-handoff.md` (si usas Claude Code, él los lee solo).

## Reglas de oro

1. **Nada de push directo a `main`.** Rama propia y Pull Request.
2. **Carpetas ajenas no se tocan.** Claude Code te pregunta tu rol al empezar y se niega a editar lo de otro (`node scripts/dueno.mjs --cambios` lo revisa en tu PR). Si algo ajeno te bloquea, lo pides (formato en `contratos.md` §8).
3. **Se trabaja contra el ambiente `dev`** (`node scripts/entorno.mjs dev`); producción solo la toca la CI y la coordinación. Migraciones aditivas; ver `ambientes.md` y `contratos.md` §3.
4. **`npm run db:seed` solo en `dev`** (antes mira `node scripts/entorno.mjs --actual`). En producción lo corre solo la coordinación, una vez, al final.
5. **Las claves nunca van al repositorio.** `.env.local` y `.env.secrets` están ignorados por git; no los pegues en chats públicos ni issues.
6. **Antes de abrir un PR:** `npm run verify` en verde (tipos, lint, unitarias, build).
7. **Pruebas que comparten estado** (paciente de prueba): se corren con el candado de `flujo-git-ci.md` §6, o las deja correr la CI.
8. **Si dudas de un contrato o archivo compartido, pregunta antes de editar.** Dentro de lo tuyo, decide y anótalo en `decisiones.md`.
9. **Congelamientos:** se respetan (hitos en `plan-de-hoy.md` §1). Lo que no esté listo queda como "Próximamente".
10. **Invariantes del producto** (`contratos.md` §6): el video nunca se guarda; sesiones cerradas y auditoría no se editan; nunca las palabras "fuerza" ni "presión".

## Puesta en marcha (por persona, ~10 minutos)

```bash
git clone https://github.com/platanus-hack/platanus-hack-26-cl-team-37.git
cd platanus-hack-26-cl-team-37
git checkout -b p<N>/<tema>         # p1/ci, p2/prescripcion, p3/torre-cubos …
# Node 22 (ver .nvmrc). Recibe .env.dev por el canal PRIVADO, ponlo en la raíz y corre: node scripts/entorno.mjs dev
npm ci
bash init.sh                        # debe terminar en INIT OK (Windows: Git Bash)
npm run dev                         # http://localhost:5174, cuentas demo en docs/manoviva-spec.md §9
```

Para ver juegos sin cámara: agrega `?fuente=sintetica` a la URL de calibración o de juego.

## Dónde está cada cosa

- Estado de funcionalidades: `feature_list.json` (cada una tiene `owner`). Qué te toca: `node scripts/siguiente-feature.mjs --owner P2`.
- Trabajo a medias de la sesión anterior: ramas `linea-G` (prescripción), `linea-H` (perfil), `linea-I` (Torre de cubos), `linea-J` (Atrapa burbujas).
- Pasos para probar en un teléfono real: `docs/telefono.md`. Red y política de seguridad: `docs/privacidad-red.md`.
- Imágenes de referencia de cada vista y los prompts originales: `docs/referencia/`.
