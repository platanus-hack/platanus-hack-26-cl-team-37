# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21
- Última sesión: 2026-11-21, F08 calibración (pantalla) → done (sin deploy: `deploy: false`).
- Feature en curso: ninguno.
- Recommended Next Step: **F09 — Base común de juegos en three.js (J0)** (`node scripts/siguiente-feature.mjs` para el detalle).

## Archivos clave (Files)

- `src/App.tsx`: todas las rutas del spec §3. Cada pantalla es `React.lazy` (salvo `/acceso`) y vive en `src/screens/<area>/<Pantalla>.tsx` como provisoria (`EnConstruccion`); el comentario de la primera línea dice qué feature la construye. **Reemplazar el archivo, no cambiar la ruta.**
- `src/auth/contexto.ts`: `useAuth()` → `{ usuario, cargando, ingresar(datos), salir() }` e `inicioDe(rol)`. `src/auth/AuthProvider.tsx` escucha `repos.auth.alCambiar`. `src/auth/Protegida.tsx`: `Protegida` (sesión + rol + `Marco`), `SoloPublica` (/acceso con sesión → inicio del rol), `AlInicio`.
- `src/ui/Marco.tsx`: banner demo (si `usuario.demo`), `Suspense`, barra inferior según el rol (con punto de alertas abiertas). Las pantallas con barra deben usar `className="pantalla con-barra"`.
- `src/ui/piezas.tsx`: se agregaron `BannerDemo` y `EnConstruccion`. `avisar(texto, error?)` muestra avisos (`<Avisos />` ya montado en App).
- `src/data/repos.ts` exporta `repos` (instancia activa). Pantallas: `import { repos } from '../../data/repos'`.
- E2E: `playwright.config.ts` (vite propio en :5176, 390×844, es-CL, cámara falsa). `e2e/ayudas.ts`: `entrarComo(context, 'paciente'|'terapeuta')` inyecta la sesión demo, `vigilarErrores(page)` junta errores de consola. `e2e/smoke.spec.ts` es la base (28 pruebas).

## Acceso (F03, hecho)

- `src/screens/acceso/Acceso.tsx`: formulario real. Validación pura en `src/auth/codigo.ts` (`normalizarCodigo`, `codigoValido`, `errorCodigo`, `correoValido`). `?rol=&codigo=` prellena.
- `e2e/acceso.spec.ts` ingresa por la UI real (7 pruebas). Las demás suites siguen usando `entrarComo()` (sesión inyectada) para no gastar ingresos de Supabase Auth.
- Cerrar sesión usa `signOut({ scope: 'local' })`: ya no revoca la cuenta demo en otros dispositivos.
- Captura con formulario lleno: `npm run captura -- "/acceso?rol=paciente&codigo=CRM-4821" acceso-lleno --como nadie` (sin `--como nadie` la captura inyecta sesión y redirige).

## Inicio del paciente (F04, hecho)

- `src/screens/paciente/Inicio.tsx`: carga con `useCarga(cargarInicio, [])` + `<Estados>`; datos = `repos.pacientes.miPaciente`, `planes.vigente`, `sesiones.listar`, `citas.proxima`.
- Funciones puras en `src/metrics/sesion.ts`: `planDeHoy(items, sesiones, hoy)` (hecho/siguiente/pendiente), `semana()` devuelve también `hechas`, `adherencia`, `racha`.
- `src/lib/useCarga.ts` (nuevo): `useCarga(fn, deps)` → `{ estado, datos, error, recargar }`, encaja con `Estados` de `ui/piezas`. Usarlo en las demás pantallas.
- "Siguiente" enlaza a `/sesion/<id del registro>/preparar` (p. ej. `/sesion/caja-juguetes/preparar`): F06 debe aceptar ese id de `src/games/registry.ts`.
- Mensaje del terapeuta: se marca visto al mostrarse. Para volver a verlo en la demo: `npm run db:seed`.
- e2e: `clienteComo('paciente')` en `e2e/ayudas.ts` da un cliente Supabase con la sesión demo (sin ingreso extra) para comparar contra la BD. Interceptar `**/rest/v1/<tabla>?*` con `page.route` sirve para probar vacío/error/carga.
- Clases nuevas en `src/index.css` (sección inicio): `.sin-vinetas`, `.icono-caja.apagado/.info`, `.ejercicio`, `.ejercicio-nombre/-detalle`, `.tira-semana`, `.punto-dia.cumplido/.pendiente/.futuro`.

## Catálogo de ejercicios (F05, hecho)

- `src/screens/paciente/Ejercicios.tsx`: `useCarga` (paciente → plan vigente + sesiones) + `<Estados>`; filtros en la URL `?gesto=Pinza|Agarre|Alcance`.
- `src/games/catalogo.ts`: `catalogo(juegos, items, sesiones, filtro)` y `nivelActual(juegoId, items, sesiones)` (plan > última sesión cerrada > 1), con pruebas en `catalogo.test.ts`.
- `src/games/Miniatura.tsx`: `<Miniatura clave={juego.miniatura} />` (SVG propio por juego). Reusarla en preparar/resumen si hace falta.
- Registro (`src/games/registry.ts`): ahora 8 juegos; `FILTROS`/`FiltroGesto`. Disponibles: `caja-juguetes` y `movilidad-guiada`. **Cada feature de juego (J1–J6) debe poner `disponible: true`** y el e2e `e2e/ejercicios.spec.ts` (constante `DISPONIBLES`) se actualiza a la par.
- Tarjeta disponible = `Link` a `/sesion/<id>/preparar`; Próximamente = `div aria-disabled`.

## Preparar la sesión (F06, hecho)

- `src/screens/sesion/Preparar.tsx`: `useCarga` (paciente → consentimiento, plan vigente, sesiones) + `<Estados>`. Lógica pura en `src/games/preparar.ts`: `valoresPorDefecto(juegoId, plan, manoAfectada, sesiones)` y `sesionPreparada(pacienteId, juegoId, prep)` → `repos.sesiones.crear(...)`.
- "Comenzar" navega a `/sesion/<S-AAAAMMDD-NN>/calibrar` **conservando `?fuente=`**. La sesión queda `estado: 'preparada'`, `parametros` = `{ mano, nivel, duracionMin, metaAgarres, metaPinzaCm, prescritoPor }` y `planVersion`; `inicio`, `calibracion`, `versionApp`, `dispositivo`, `versionModelo` = null (los llenan F08+ con `repos.sesiones.actualizar`).
- Sin consentimiento → `/privacidad` con `state.volver` (F18 debe volver ahí tras firmar).
- Registro: `NivelJuego.detalle` (texto por nivel); los juegos nuevos deben definirlo. `nivelDe(juegoId, n)` da tamaño/cantidad/distancia del nivel para el juego.
- e2e que crean sesiones: limpiar con `npx tsx scripts/limpiar-preparadas.ts <ISO desde>` (borra solo `preparada` de pacientes demo creadas desde esa fecha). Ver `e2e/preparar.spec.ts` (try/finally). F08 puede crear su sesión de prueba igual y limpiarla así — ojo: una sesión que pasó a `en curso` no la borra este script (ampliarlo o re-seed).
- Clases CSS nuevas (sección "preparar sesión"): `.preparar`, `.preparar-tarjeta`, `.preparar-valor`, `.niveles`, `.duracion`, `.boton-paso`, `.autor`, `.consejo`.

## Seguimiento de manos (F07, hecho) — `src/tracking/`

- **Interfaz** (`tipos.ts`): `FuenteManos` = `{ tipo, estado, fps, ultimo, ultimaDeteccion, luminancia, video, detalleError, iniciar(), detener(), alCuadro(fn) → quitar, alEstado(fn) → quitar }`. Cuadro = `{ t, manos: ManoSeguida[], ancho, alto }`; `ManoSeguida = { lado: 'derecha'|'izquierda', landmarks (21, normalizados 0..1, imagen SIN espejo), worldLandmarks (21, metros, centrados), confianza }`. Estados: `iniciando | sin permiso | sin camara | error | buscando | detectada | perdida` (perdida tras 300 ms sin mano).
- **Crear**: `crearFuente(configDesdeUrl(location.search))` (`fuentes.ts`, async; la cámara y MediaPipe se cargan con `import()`), o en React `const { fuente, estado, error } = useFuenteManos(location.search)` (inicia/detiene sola; los cuadros se leen con `fuente.alCuadro` o `fuente.ultimo`, sin re-render por cuadro). **Pasar `?fuente=` de pantalla en pantalla** (F06 ya lo hace hasta /calibrar).
- **URL**: `?fuente=camara|sintetica|grabacion` (por defecto camara) · `&guion=calibracion|quieta|abrir-cerrar|pinza|mover|sin-mano|ambas` · `&lado=izquierda` · `&grabacion=/ruta.json` (por defecto `/grabaciones/demo.json`) · `&lateralidad=invertida` · `&delegado=cpu|gpu`.
- **Sintética** (`sintetica.ts` + `FuenteSintetica`): `PoseMano = { apertura 0..1, dedos: {pulgar,indice,medio,anular,menique: flexión 0..1}, pinzaCm | null, x, y (imagen cruda), distanciaCm, giroDeg, pronacionDeg, inclinacionDeg, confianza, visible }`. Guion = `{ manos: [{ lado, poses: PoseClave[] }], bucle?, luz?, camara? }`; `secuencia([[durMs, pose], ...])` arma claves; cada clave hereda lo no indicado (`dedos` se reemplaza), interpolación lineal. El preset por defecto `calibracion` hace: abierta 2,5 s → abrir/cerrar ×3 → pinza 0,5 cm 1,5 s → suelta (≈ 9,9 s, en bucle): pensado para que F08 complete sus 3 pasos con `?fuente=sintetica`.
- **Control en vivo (e2e)**: `window.__manoviva.fuente` (solo fuentes simuladas) → `cargarGuion(g)`, `fijarPose({ apertura: 0 }, 'derecha')`, `ocultar()`, `fijarLuz(30)`, `reiniciarReloj()`. Un guion puesto con `page.addInitScript(() => { window.__manoviva = { guion: {...} } })` reemplaza al preset al crear la fuente. Para manejar el tiempo a mano en unitarias: `new FuenteSintetica(guion, relojManual())` + `reloj.t = ...; fuente.paso()`.
- **Grabación** (`grabacion.ts`): `new GrabadorLandmarks('camara')` + `fuente.alCuadro(c => g.agregar(c))` → `g.json()`; `descargarJson(texto)` en `fuentes.ts`; `leerGrabacion(texto)` + `new FuenteGrabacion(g)`. Solo números de landmarks, nunca video. Regenerar la demo: `npx tsx scripts/generar-grabacion.ts [guion] [salida]`.
- **Distancia** (`distancia.ts`): `estimarDistanciaCm(mano, ancho, alto, { largoReglaCm, focalPx })` → `{ cm, metodo: 'perspectiva'|'pinhole' }` (al centro de la palma; mostrar "aprox."); `new EstimadorDistancia(opts).estimar(mano, ancho, alto, t)` suavizado por lado; `focalDesdeDistanciaConocida(...)` para calibrar la focal en /depuracion (F21).
- **Cámara** (`camara.ts`): `fuente.video` es un `<video>` creado por la fuente (no está en el DOM): F08 lo monta/dibuja en espejo (`transform: scaleX(-1)` o `espejarX` para los puntos). `fuente.delegado` dice GPU/CPU. Corta la telemetría de MediaPipe (odml.pa.googleapis.com). Chromium headless: CPU ~18 fps; GPU por software pasa sola a CPU tras ~3–5 s.
- Métricas de mano: `src/metrics/geometria.ts` (`largoMano`, `aperturaPinza`, `aperturaMano`, `flexionDedo`, `luminanciaMedia`, `clasificarLuz`, `CONEXIONES` para dibujar).
- e2e: `e2e/tracking.spec.ts` importa `/src/tracking/fuentes.ts` del servidor dev dentro de `page.evaluate` (útil mientras no haya pantalla).

## Calibración (F08, hecho) — `/sesion/:id/calibrar`

- `src/screens/sesion/Calibrar.tsx`: carga sesión + paciente (`largoManoCm` = regla) con `useCarga`; `useFuenteManos(location.search)`; cada cuadro (`fuente.alCuadro`) dibuja (`src/ui/dibujoMano.ts`: `dibujarManos(lienzo, cuadro, elegida, { silueta })`, `colorPunto(i)`), mide y avanza la máquina pura; React se refresca cada 150 ms. El `<video>` de la cámara se monta en `.calibrar-fondo` (espejo por CSS).
- Lógica pura `src/metrics/calibracion.ts`: `avanzarCalibracion`, `resultadoCalibracion(estado, regla)` → `Calibracion`, `elegirMano(manos, parametros.mano)`, `medidasMano`, `chequeoLuz/Distancia/Confianza`, `aVista(p, img, vista)` (espejo + object-fit cover, útil para la miniatura de cámara del juego), `UMBRALES`.
- Guarda con `repos.sesiones.actualizar`: `calibracion`, `inicio`, `dispositivo`, `versionApp`, `versionModelo` (`src/lib/version.ts`). **El estado sigue 'preparada'**: F09 debe pasarlo a 'en curso' al empezar a jugar (y entonces los e2e de juego necesitan ampliar `limpiar-preparadas.ts` o re-seed).
- Al completar navega sola (2 s) a `/sesion/<id>/jugar?fuente=…`. F09 puede leer `sesion.calibracion` (largo de mano, escala cm, rango abrir/cerrar para umbrales de agarre, pinza máx.).
- Probar a mano: `ID=$(npx tsx scripts/crear-preparada.ts)` → `npm run captura -- "/sesion/$ID/calibrar?fuente=sintetica" calibrar` (o `/jugar`) → `npx tsx scripts/limpiar-preparadas.ts <ISO desde>`.
- Preset sintético `calibracion` = teléfono vertical (480×640, mano centrada) y `public/grabaciones/demo.json` regenerado igual. Para juegos horizontales usar otros presets o inyectar guion con `camara: { ancho: 640, alto: 480 }`.
- e2e `e2e/calibrar.spec.ts`: sesión falsa con `page.route('**/rest/v1/sesiones?*')` (GET → `[fila]`; maybeSingle acepta arreglo) para probar estados sin escribir en la BD; permiso denegado = `getUserMedia` rechazado con `DOMException(…, 'NotAllowedError')` en `addInitScript`. En `e2e/` no hay tipos DOM: usar `globalThis as unknown as {...}`.

## Cuidado con

- Correr `bash init.sh` antes de nada. Si `npm install` borró los binarios nativos de Windows, init.sh los repone.
- Vitest solo corre `src/**/*.test.ts(x)` (vite.config.ts); las pruebas de `e2e/` corren con `npm run e2e`.
- En `e2e/` los imports relativos llevan `.ts` (tsconfig.node.json usa nodenext).
- Git Bash convierte `/ruta` en ruta de Windows: `scripts/captura.mjs` lo deshace; para otros comandos usar `MSYS_NO_PATHCONV=1`.
- Pantallas siempre vía `repos`, no `supabase` directo.
- Fechas: el seed usa la fecha del día en que se corre. Si las vistas se ven vacías, `npm run db:seed`.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad, PWA instalada, modo avión, rendimiento.
- Medir con regla y goniómetro (docs/validacion.md, F21).

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK.
2. `node scripts/siguiente-feature.mjs` → F09.
3. Marcar F09 `in-progress` y seguir CLAUDE.md. La sesión llega a /jugar 'preparada' con `calibracion` e `inicio` llenos; F09 la pasa a 'en curso'. Si sus e2e dejan sesiones 'en curso', ampliar `scripts/limpiar-preparadas.ts` (hoy borra solo 'preparada') o re-seed.
4. Notas para F09 (juegos): la pausa automática usa `fuente.ultimaDeteccion` (ms del reloj de la fuente, mismo que `cuadro.t`); los e2e de juegos manejan las manos con `window.__manoviva.fuente.cargarGuion(...)`; para un guion propio de juego (p. ej. "tomar y dejar en la caja") agregar un preset en `GUIONES_PRESET` o inyectarlo.
