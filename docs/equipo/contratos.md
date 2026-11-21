# Contratos

Un **contrato** es lo que otra persona del equipo da por cierto cuando trabaja en lo suyo. No se cambia sin avisar y sin que
todo siga funcionando. Cada contrato dice quién lo mantiene, qué garantiza y cómo se cambia.

---

## 1. Contrato de juego · mantiene P2, consume P3

**Fuente de verdad:** `src/games/shell/contrato.ts` (tipos con comentarios). Ejemplos que funcionan:
`src/games/pinza/` (sin física), `src/games/caja/` (con física Rapier), `src/games/movilidad/`.

### 1.1 Qué es un juego
Un módulo `src/games/<id>/modulo.ts` que exporta `crear<Nombre>(): ModuloJuego`. La base común (`shell/`) pone el canvas
three.js, la mesa, las luces, las manos virtuales, el HUD, el ciclo de sesión (pausa manual y automática, fin por tiempo o meta),
el registro de eventos y de muestras a 10 Hz. El juego solo aporta su lógica y sus objetos.

Orden de llamadas: `montar(ctx)` → `actualizar(manos, dt)` en cada cuadro mientras se juega → `hud()` ~5 veces por segundo →
`resumen(base)` al terminar → `desmontar()`. Si `usaFisica`, la base avanza Rapier a 60 Hz **antes** de cada `actualizar`.

### 1.2 Lo que el juego declara (no es opcional)
- `id`, `nombre`, `gestos`, `miniatura`, `pista`.
- `niveles` 1 a 5, cada uno con `nombre` y `detalle` visibles para el paciente.
- `meta`: `etiqueta`, `unidad` y `desdePlan(p)`; `0` significa práctica libre (termina solo por tiempo).
- `tiposEvento`: solo tipos que existan en la base (ver 1.4).
- `metricasVivo` (hasta 3, la primera con minigráfico) y `metricasResumen`, cada una con `id`, `nombre`, `unidad`, `formula`, `mejor` y `aprox` si es medida de cámara.
- `usaFisica`.

### 1.3 Lista de verificación para agregar un juego (todo, en el mismo PR)
1. `src/games/<id>/logica.ts` con la lógica pura y `<id>.test.ts` con sus pruebas unitarias.
2. `src/games/<id>/modulo.ts` con `crear<Nombre>()`.
3. **Una línea** en `src/games/shell/modulos.ts` (import diferido, como los demás).
4. Entrada en `src/games/registry.ts`: copia la de `pinza-fina`. **`disponible: true` solo cuando todo lo demás de esta lista esté listo.**
5. Miniatura en `src/games/Miniatura.tsx` (las claves `torre`, `burbujas`, `naranja`, `memoria` y `piano` ya existen; revisa que se vean bien).
6. Agregar el id a `DISPONIBLES` en `e2e/ejercicios.spec.ts`.
7. `e2e/<id>.spec.ts`: juego completo con la fuente simulada, **mano derecha y mano izquierda**, sobre una sesión real de un paciente demo que termina en `/sensacion` (sin cerrarla); limpieza por **id explícito** (ver §5).
8. CSS propio en un archivo junto al juego (nunca en `src/index.css`).
9. Captura horizontal (`npm run captura -- "<ruta>" <id> --horizontal`) comparada con `docs/referencia/imagenes_juegos/`.
10. Visto una vez en un teléfono.

### 1.4 Eventos
La base ya permite todos los tipos de J1–J6 (migración `20261121400001`, y el tipo `TipoEvento` en `src/domain/types.ts`):
`agarre_inicio, agarre_fin, soltar, perdida_seguimiento, pausa, reanudar, tomar, colocado, caida, objetivo_mostrado, toque, error,
no_alcanzado, reventada, intento_cerrado, expirada, cierre_inicio, umbral_alcanzado, sostenido_completo, apertura_completa,
repeticion_incompleta, sobre_carta, volteo, par, no_par, retorno_palma_abajo, nota_mostrada, acierto, dedo_equivocado, nota_perdida`.
Un tipo nuevo exige migración (§3) **y** actualizar `TipoEvento`.

### 1.5 Reglas de contenido
- Nunca "fuerza" ni "presión" en textos, métricas ni nombres visibles (la cámara no mide fuerza).
- Medidas en cm y grados son estimaciones: `aprox: true`. No se interpretan clínicamente: describen, no diagnostican.
- Decimales con coma y español de Chile: usa `src/lib/formato.ts`.
- **Profundidad:** acercar la mano a la cámara la mete hacia el **fondo** de la mesa (`ZONA_BASE.z = [-0.9, 0.9]` en `shell/manos3d.ts`). No lo inviertas en un juego.
- Objetivo de rendimiento: ≥ 24 fps en un teléfono de gama media. Pixel ratio ya limitado a 1,5 por la base.

### 1.6 Cómo se cambia este contrato
Solo P2, y **solo agregando** (campos opcionales con comportamiento anterior por defecto). Un cambio incompatible exige actualizar todos los
juegos y sus pruebas en el mismo PR, y avisar a P3 antes. P3 puede proponer cambios con el formato de §8.

---

## 2. Contrato de seguimiento y fuente simulada · mantiene P2 (adiciones de P3 permitidas)

- Todo el código ve las manos como `ManoSeguida` (`src/tracking/tipos.ts`): `lado`, `landmarks`, `worldLandmarks`, `confianza`. La fuente se elige con `?fuente=camara|sintetica|grabacion`.
- **La fuente simulada (`src/tracking/sintetica.ts`) es la base de todas nuestras pruebas.** Solo se le **agrega**: campos nuevos de pose con valor por defecto que no cambie lo que ya genera (ejemplo reciente: `pinzaDedo`). Debe seguir siendo determinista.
- Los ganchos `window.__manoviva` existen solo para pruebas; no los uses para lógica de la app.
- **Ningún cuadro de video se guarda ni sale del dispositivo.** La telemetría de MediaPipe está bloqueada y hay una prueba que falla si algo sale; no la quites.

## 3. Contrato de datos · mantiene P1 (`src/data/`), consumen todos

1. **Las pantallas y juegos usan `repos`** (`src/data/repos.ts`), nunca `supabase` directo. Agregar un método = interfaz en `repos.ts` + implementación en `supabaseRepos.ts`. `repos` está envuelto por `sinConexion.ts` con `...base`, así que un método nuevo pasa solo (y no tiene respaldo sin conexión salvo que se lo agregues).
2. **Hay UNA sola base de datos y es la de producción.** Lo que apliques en una migración lo ve el sitio publicado al instante.
3. Reglas de migración:
   - Archivo nuevo en `supabase/migrations/`. **Nunca editar una migración ya aplicada.**
   - Solo **aditivas y compatibles**: tablas, columnas con valor por defecto, funciones nuevas. Nada de `drop`, `rename`, `alter … not null` sobre datos existentes ni cambios de políticas que den más acceso.
   - Numeración (para no chocar): **P1** `20261122100NNN_…`, **P2** `20261122200NNN_…`, **P3** `20261122300NNN_…`. Aplicar con `supabase db push --include-all`.
   - Toda migración se menciona en el PR y la revisa otra persona.
   - Si abandonas un PR con una migración ya aplicada, avisa: la migración se queda igual en `main`.
4. **Seguridad por filas (RLS):** no se relaja. Una tabla nueva trae sus políticas y su caso en `scripts/verificar-rls.ts`. `npm run verify:db` debe seguir en verde.
5. Inmutabilidad: sesiones cerradas, auditoría y planes no se editan ni se borran desde código de la app. Hay una prueba estática (`src/domain/solo-agregar.test.ts`) que lo vigila.

## 4. Contrato de interfaz · mantiene P1

- Los colores, radios y tipografías son variables de `src/index.css`. **Solo P1 edita `src/index.css`**; los demás ponen su CSS en un archivo propio junto a su pantalla o juego.
- `src/ui/piezas.tsx` e `Icono.tsx` son compartidos: los cambios son **compatibles hacia atrás** (props nuevas opcionales). Si hay que romper algo, P1 actualiza a los consumidores en el mismo PR.
- Las pruebas e2e dependen de textos, roles y `data-testid`. Antes de cambiar un texto visible haz `grep` en `e2e/`; si lo usa una prueba, actualízala en el mismo PR.
- Accesibilidad mínima para pacientes con poca destreza: zonas táctiles ≥ 48 px, texto ≥ 14 px, nada que exija gestos finos.
- Fuente de verdad visual: `docs/referencia/imagenes/` y `docs/manoviva-spec.md` §2.

## 5. Contrato de pruebas · mantiene P1

**Para abrir un PR:** `npm run verify` (tipos, lint, unitarias, build) y los e2e de tu área. La CI corre además todo e2e.

**Estado compartido (importante porque la base es una sola):**
- Los e2e que **cierran sesiones o cambian ajustes** usan el paciente de prueba `prueba.demo@example.com`, oculto al terapeuta. Hoy: `csp`, `flujo-paciente`, `historial`, `offline`, `privacidad`, `sensacion` (revisa con `grep -l "prueba" e2e/*.ts`).
  **Dos personas no pueden correrlos a la vez.** Aplica el candado de `flujo-git-ci.md` §6, o deja que corra en la CI (que está serializada).
- Los e2e de juegos y pantallas crean sesiones reales de pacientes demo que terminan en `/sensacion` sin cerrarse. **Se limpian siempre por id explícito**, nunca por rango de fechas (una limpieza por fecha ya borró la sesión de otra prueba).
- **Nunca crear versiones de plan, alertas ni auditoría** en Carmen, Luis, Marta ni Jorge desde una prueba. Si necesitas datos de terapeuta, usa un ayudante de `scripts/` que luego los deje como estaban.
- `npm run db:seed` está prohibido (§ reglas de oro).

**Pruebas inestables:** con el computador cargado, los e2e de juegos con física o varios workers fallan a veces. Antes de dar un fallo por real:
rerun solo ese archivo con `--workers=1`. Si pasa, anótalo; no lo marques como `skip`. Un `test.skip` o `fixme` necesita un issue y el visto bueno de P1.

## 6. Invariantes del producto (nadie los rompe, ninguna excusa)

1. El video de la cámara no se guarda ni se envía; solo puntos, eventos y métricas.
2. Sesión cerrada inmutable (hash SHA-256 verificable); auditoría de solo agregar; planes versionados.
3. Sin las palabras "fuerza" ni "presión"; sin diagnósticos ni recomendaciones clínicas automáticas.
4. Medidas de cámara siempre como estimaciones.
5. Las claves (`.env.local`, `.env.secrets`) nunca van al repositorio, a la CI en texto plano ni a los logs.

## 7. Mapa de archivos y quién lleva cada área

Este mapa es **orientativo**: dice a quién avisar y quién revisa mejor cada cosa. No hay bloqueo por dueño: cualquiera puede editar cualquier archivo en su PR
(se quitaron `scripts/dueno.mjs`, `docs/equipo/propiedad.json` y el paso de la CI que los usaba).

| Ruta | Quién lo lleva | Si lo cambias tú |
|---|---|---|
| `src/ui/`, `src/index.css`, `.github/`, `vercel.json`, `.vercelignore`, `playwright*.ts` | P1 | PR chico a P1 |
| `src/data/` (repos, sin conexión, cola local) | P1 | método nuevo en repos: aditivo, avisar a P1 |
| `src/games/shell/`, `src/games/caja|movilidad|pinza/` | P2 | solo aditivo y avisando |
| `src/tracking/` | P2 | `sintetica.ts` y `fuentes`: solo agregar (P3 puede) |
| `src/metrics/`, `src/screens/terapeuta/` | P2 | PR a P2 |
| `src/games/<juego nuevo>/` | P3 | — |
| `src/games/registry.ts`, `src/games/shell/modulos.ts`, `src/games/Miniatura.tsx`, `e2e/ejercicios.spec.ts` | **compartido P2/P3** | solo **agregar líneas** para tu juego; en el PR se resuelven choques de una línea |
| `src/screens/paciente/`, `src/screens/acceso/`, `src/screens/privacidad/` | P1 (visual) y P2 (lógica) | si cambia lógica: P2 revisa; si cambia lo visual: P1 revisa |
| `src/domain/` (tipos, integridad) | P2 | solo aditivo; `TipoEvento` lo amplía quien agrega eventos |
| `supabase/migrations/` | cualquiera, con las reglas de §3 | revisa otra persona |
| `scripts/` | quien lo creó | no cambiar `seed.ts` ni los ayudantes de limpieza sin avisar |
| `feature_list.json` | cada uno solo sus entradas (`owner`) | — |
| `docs/equipo/` | coordinación | proponer cambios por PR |

## 8. Cómo pedir algo a otro rol

Pedirlo es opcional: también puedes hacer el cambio tú en tu PR y avisar. Si prefieres que lo haga quien lleva el área, mensaje en el chat (y, si queda, issue en GitHub) con este formato corto:

```
Para: P2   De: P3   Urgencia: bloquea mi juego / puede esperar
Necesito: que contrato.ts permita X
Motivo: el juego Y no puede hacer Z sin eso
Propuesta: campo opcional `x?: …` (no cambia lo existente)
```

El dueño responde en **30 minutos**. Si no responde, el pedido pasa a la coordinación, que decide. Si es un cambio aditivo y pequeño en un archivo
compartido de la tabla de §7, puedes hacerlo tú mismo en un PR separado y marcar al dueño como revisor.

## 9. Registro de decisiones

`docs/equipo/decisiones.md`: una línea por decisión que afecte a otros (fecha, quién, qué, por qué). Se **agrega al final**, nunca se reescribe.
Cada persona lleva además su bitácora en `docs/equipo/registro-P1.md`, `registro-P2.md` o `registro-P3.md` (así `progress.md` no se llena de choques de merge).
