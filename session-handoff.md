# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-21
- Última sesión: 2026-11-21, F13 Resumen de sesión y cierre con hash → done (deploy a producción). Además: paciente de PRUEBA para e2e que cierran sesiones y arreglo de `<Estados>` con `null`.
- Feature en curso: ninguno.
- Recommended Next Step: el que diga `node scripts/siguiente-feature.mjs` (F14 esperado).

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
- e2e que crean sesiones: limpiar con `npx tsx scripts/limpiar-preparadas.ts <ISO desde> <id>` (desde F09 borra 'preparada' y 'en curso' de pacientes demo, con sus eventos, vía la RPC `limpiar_sesiones_prueba`; **pasar siempre el id**: los e2e corren en paralelo y sin id se borran todas las de prueba desde esa fecha, también las de otra prueba en curso). Ver `e2e/shell.spec.ts` (`let id = ''` antes del try, `limpiar(desde, id)` en el finally).
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

## Base común de juegos (F09, hecho) — `src/games/shell/` · contrato en spec §7

**Cómo agregar un juego (F10 Caja, F11 Movilidad, F22–F27):**
1. `src/games/<juego>/modulo.ts` exporta `export const crearX: CrearJuego = () => ({ ...ModuloJuego })` (estado del juego en el cierre; una instancia por montaje, `montar` se llama una sola vez por instancia).
2. Registrar en `src/games/shell/modulos.ts` como `'caja-juguetes': () => import('../caja/modulo').then((m) => m.crearCaja)` (Caja y Movilidad ya están). Sin esto, /jugar muestra "<juego> todavía no está listo".
3. `disponible: true` en `src/games/registry.ts` + `DISPONIBLES` de `e2e/ejercicios.spec.ts` al cerrar el feature.
4. Eventos propios fuera de `agarre_inicio | agarre_fin | soltar | perdida_seguimiento | pausa | reanudar` → migración NUEVA que amplíe el check de `eventos_sesion` + agregar el tipo a `TipoEvento` (`src/domain/types.ts`). Caja (F10) y Movilidad (F11) no lo necesitan.

**ModuloJuego** (`contrato.ts`): `id, nombre, gestos, miniatura, niveles: Record<1..5, { nombre, detalle, ...propios }>, meta: { etiqueta ('Agarres'), unidad ('agarres'), desdePlan(p) → número (0 = sin meta) }, tiposEvento, metricasVivo (≤ 3; la 1.ª con minigráfico), metricasResumen, usaFisica, pista, textoReiniciar?` y métodos `montar(ctx)` (puede ser async), `actualizar(manos, dt)` (cada cuadro, SOLO jugando; dt en s), `hud()` → `{ contador, vivo: { [idMetrica]: número|null }, manos?: { izquierda?|derecha?: { texto: 'Agarrando', tono: 'acento'|'ok'|'neutro' } }, pista? }` (la base lo llama cada 200 ms; `contador` decide la meta), `reiniciar?()` (botón amarillo), `muestra?()` → canales 10 Hz, `resumen?(base: EntradaAgregados)` → `metricas.juego`, `desmontar()`.
- `DefMetrica = { id, nombre, unidad: ''|'cm'|'°'|'%'|'s'|'ms', formula, decimales?, aprox?, mejor? }`. Valores en la unidad mostrada (% = 0..100). `formatoMetrica(def, v)` da "2,1 cm", "68°", "86%".

**ContextoJuego** (`ctx` en montar): `escena` (THREE.Scene), `camara`, `mesa = { ancho 5,4, fondo 3,3, altura 0 (cara de arriba), z −0,25, objeto }` (unidades ≈ 10 cm), `manos` (ManosVirtuales: `punto(lado, i)` → THREE.Vector3 del landmark i en la escena, `palma(lado)`, `visible(lado)`), `fisica` (`{ RAPIER, mundo, paso, avanzar, liberar }` o null; la base ya crea el piso de la mesa y avanza el mundo ANTES de `actualizar`), `sesion`, `parametros`, `nivel` (= `niveles[parametros.nivel]`), `meta`, `calibracion`, `escalaCm`, `fuente`, `registrar(tipo, { mano, objeto, datos })`, `medidas(lado)` → `{ aperturaPinzaCm, apertura (0..~1,2), aperturaCalibrada (0..1 con rangoAbrirCerrar de la calibración, o null), flexion {pulgar..menique} (MCP+PIP, grados), muneca {x,y} (imagen cruda), distanciaCm }` o null, `manoPrincipal()` (lado de la mano de la sesión visible), `ahora()` (ms de juego activo), `configurarManos(zonaParcial)` (dónde se mueven las manos virtuales: `ZONA_BASE` en `manos3d.ts`).

**Lo que hace la base (no repetir en el juego):** HUD completo (`Hud.tsx`; estado de mano por defecto Abierta/Cerrada si `hud().manos` no trae ese lado; '—' sin mano), ciclo (`ciclo.ts`: esperando → jugando ⇄ pausa → terminada; pausa manual con Menú, en vertical, en segundo plano y sin mano > 2 s, que se reanuda sola), eventos `pausa{motivo}`/`reanudar`/`perdida_seguimiento`, muestras 10 Hz (apertura de pinza cm + flexión del índice de la mano principal + canales del juego), agregados base con `AcumuladorBase` (calidad del registro, apertura y flexión máx., suavidad SPARC de la muñeca por ventanas de 3 s, fps medio) → `metricas = { ...agregarSesion(base), metaCumplida, juego, contador, meta, motivoFin }`, guardado (`repos.sesiones.actualizar` con `metricas`, `muestras`, `fin`; estado sigue 'en curso') y navegación a `/sesion/:id/sensacion?<query>`. Aviso "🎉 ¡Meta cumplida! N/N" y fin 2,5 s después. Wake Lock, "Gira tu teléfono", pixel ratio ≤ 1,5 + calidad adaptativa, `?depuracion=1` muestra fps.
- **e2e de juegos:** utilidades en `e2e/juegos.ts` (desde F10): `crearSesion(juego, duracionMin, meta, nivel = 2)` (sesión real con el cliente demo, sin ingreso extra) + `limpiar(desde, id)`; o `sesionFalsa(page, juego, duracionMin, meta, nivel)` (rutas de PostgREST simuladas, devuelve las escrituras PATCH/POST); `juego(page)`, `esperarFase`, `HORIZONTAL`, `ID_FALSO`, tipo `Ventana`. Ejemplos: `e2e/shell.spec.ts`, `e2e/caja.spec.ts`. Estado del juego en `window.__manovivaJuego` (`fase, motivo, fps, calidad, pixelRatio, jugadoMs, contador, eventos, muestras, fisica, vivo`). Manos: `window.__manoviva.fuente.cargarGuion({ manos: [{ lado, poses: [{ t, x, y, apertura, pinzaCm, distanciaCm, ... }] }] })`, `fijarPose`, `ocultar`. Viewport horizontal `page.setViewportSize({ width: 844, height: 390 })` (el config usa 390×844 → "Gira tu teléfono").
- Captura horizontal: `ID=$(npx tsx scripts/crear-preparada.ts <juego> derecha 5 12 [nivel])` → `npm run captura -- "/sesion/$ID/jugar?fuente=sintetica&guion=ambas" <nombre> --horizontal --espera 3000` → `npx tsx scripts/limpiar-preparadas.ts <ISO desde> $ID`. Para una captura "en acción" conviene sacarla desde el e2e con `page.screenshot` (así lo hace Caja con `CAPTURA_CAJA=1`).
- Clases CSS en `src/index.css` (sección "juego: base común"): `.juego`, `.juego-vista`, `.juego-caja` (paneles oscuros), `.juego-panel`, `.juego-barra`, `.juego-menu`, `.juego-metricas`, `.juego-camara`, `.juego-centro`, `.juego-pildora(.exito)`, `.juego-aviso`, `.juego-capa`, `.juego-dialogo`, `.juego-girar`.

## Caja de juguetes (F10, hecho) — `src/games/caja/`

- `logica.ts` (puro, pruebas `caja.test.ts`): `CAJA` (1,3 × 0,95 × 0,34 u en z −0,35), `posicionesJuguetes(cantidad, distanciaCaja)` (alterna lados de la caja, determinista), `distanciaToma(pinza, centro, forma, tam)` (cerca: ≤ radio + 0,3 en la mesa y ≤ 0,7 sobre la cara de arriba), `dentroDeCaja` (interior x/z, apilado hasta 0,5 sobre el borde cuenta), `cayoDeLaMesa`, `estaQuieto`.
- `modulo.ts` → `crearCaja` (registrado en `modulos.ts`). Pinza con histéresis por mano (`pasoAgarre` + `configDesdeCalibracion`); juguete cinemático mientras se sostiene, dinámico al soltar. Eventos: `agarre_inicio` → `agarre_fin {duracionMs}` → `soltar {enCaja, motivo?}` al quedar quieto. Guardados quedan en la caja; caja llena → todos vuelven solos; "Reiniciar objetos" igual (el contador se mantiene). Vivo: `pinza` (cm, minigráfico), `flexIndice` (°), `suavidad` (% promedio de traslados). `resumen()` → `agarres, intentos, precision (%), tiempoMedioAgarre, aperturaMax, flexionIndiceMax, suavidad` (SPARC por traslado; reemplaza la de la base). Canal de muestras `agarrando`.
- `contarAgarres` (src/metrics/sesion.ts) ahora mide el tiempo hasta `agarre_fin` si existe.
- Depuración/e2e: con fuente simulada `window.__manoviva.juego.estado()` → `{ contador, objetos[{id, forma, tam, estado: mesa|tomado|soltado|guardado, x,y,z, inicio}], caja, zona, pinza{lado}, punta{lado}, agarrando, umbrales }`. Otros juegos pueden exponer su `estado()` en el mismo lugar (tipo en `src/tracking/fuentes.ts`). `e2e/caja.spec.ts` tiene la clase `Mano` (mover con guion sin bucle, `apuntar` en lazo cerrado sobre x de la imagen y distancia) reutilizable para juegos de alcance.
- Capturas: `CAPTURA_CAJA=1 npm run e2e -- caja -g exactos` → `docs/capturas/caja.png` y `caja-meta.png` (oculta la franja de fps).

## Movilidad guiada (F11, hecho) — `src/games/movilidad/`

- `logica.ts` (puro, pruebas `movilidad.test.ts`): `NIVELES_MOVILIDAD` (nombre, detalle, umbrales `cierre`/`apertura` de apertura calibrada, tramos de la guía en ms, `guiaCerrada`), `nivelMovilidad(n)`, `guiaEn(tMs, nivel)` → `{ objetivo 0..1, fase: abierta|cerrando|cerrada|abriendo }`, `PISTAS`, `pasoCiclo` (histéresis; devuelve `cierre` o `ciclo {duracionMs, rango}`), `ritmoCpm(tiempos, ahora)`, `ritmoMedio`. El registro toma nombre/detalle de los niveles desde aquí.
- `modulo.ts` → `crearMovilidad` (registrado en `modulos.ts`, `usaFisica: false`). Meta = `metaAgarres` (etiqueta "Ciclos"). Eventos: `agarre_inicio {objeto:'ciclo'}` al cerrar y `soltar {objeto:'ciclo', enCaja:true, duracionMs, rango}` al reabrir (como el seed) → agregados de la base sirven tal cual (agarres = ciclos). Deja de contar al cumplir la meta. 'ambas' = cada mano cuenta. Vivo: `apertura` (%), `flexIndice`, `ritmo`. Resumen (`metricas.juego`): `ciclos, ritmo, tiempoMedioCiclo, rango, aperturaMax, flexionIndiceMax, seguimiento`. Canales: `aperturaMano`, `guia`.
- Escena: mano guía fantasma (clase `ManoGuia`, usa `manoSintetica` + `puntosEnEscena` con zona de ancla fija) + halo + anillo; por mano que cuenta, anillo propio vs. anillo de la guía, onda por ciclo; arco de cuentas al fondo (≤ 12). `configurarManos` corre la zona de manos a un lado (y la baja: y 0,1–1,35).
- Depuración/e2e: `window.__manoviva.juego.estado()` → `{ contador, meta, lados, cerrada, apertura, objetivo, fase, umbrales, ciclosT }`.
- e2e `e2e/movilidad.spec.ts`; capturas `CAPTURA_MOVILIDAD=1 npm run e2e -- movilidad -g exactos` → `docs/capturas/movilidad.png` y `movilidad-meta.png`; `movilidad-ambas.png` con `crear-preparada.ts movilidad-guiada ambas 3 10 1` + captura `--horizontal`.
- **Para F13 (Resumen):** leer `modulo.metricasResumen` del juego de la sesión (Movilidad no tiene precisión ni suavidad propias; sus valores están en `metricas.juego`).

## Dolor y esfuerzo (F12, hecho) — `/sesion/:id/sensacion`

- `src/screens/sesion/Sensacion.tsx`: carga sesión + umbral (`planDeSesion`: plan de `planVersion`, si no el vigente) con `useCarga` (el cargador devuelve `{ datos }` porque `<Estados>` trata `null` como "cargando"). Formulario solo si la sesión está 'en curso'; 'cerrada' → "Ver resumen", 'preparada' → "Ir a calibrar", inexistente → "Ver ejercicios".
- Guardar: `repos.sesiones.actualizar(id, { dolorEVA, esfuerzo, nota })` (estado NO cambia) → si EVA ≥ umbral y no hay alerta de dolor de esa sesión (`repos.alertas.deSesion`), `repos.alertas.crear` + aviso → navega a `/sesion/:id/resumen` + mismo query. Volver a /sensacion muestra lo guardado.
- Reglas puras: `src/domain/sensacion.ts` (`pasoEva`, `planDeSesion`, `requiereAlerta`, `sensacionAGuardar`, `EVA_MAX`, `NOTA_MAX`).
- e2e `e2e/sensacion.spec.ts`: función `falsa(page, estado, umbral, extra)` simula sesiones/planes/alertas (ojo: el POST de alertas va a `/rest/v1/alertas` SIN `?`, usar el glob `**/rest/v1/alertas*`). Prueba real crea una sesión 'en curso' (`crearSesion` + update con `clienteComo`) y limpia con `limpiar(desde, id)` (borra también su alerta). Capturas `CAPTURA_SENSACION=1 npm run e2e -- sensacion` → `sensacion-llena.png`, `sensacion-alerta.png`; `sensacion.png` con `ID=$(npx tsx scripts/crear-preparada.ts caja-juguetes derecha 5 12 2 en-curso)` + `npm run captura -- "/sesion/$ID/sensacion?fuente=sintetica" sensacion` + limpiar.
- **Para F13 (Resumen):** la Sesion llega 'en curso' con `metricas`, `muestras`, `fin`, `dolorEVA` (siempre), `esfuerzo`/`nota` (pueden ser null). F13 cierra con hash (`src/domain/integridad.ts`). Las pantallas de alertas del terapeuta ya tienen filas reales de tipo 'dolor' con `valor`.

## Paciente de PRUEBA para e2e que CIERRAN sesiones (F13) — leer antes de escribir e2e

- Cerrar una sesión (estado 'cerrada' + hash) la vuelve inmutable: `limpiar-preparadas.ts` ya no la borra y `verify:db` exige que Carmen tenga EXACTAMENTE 19 sesiones. **Todo e2e que llegue a /resumen (o cierre de otra forma) debe usar el paciente de prueba**, nunca a Carmen.
- Cuenta: `prueba.demo@example.com` / `manoviva-demo` ("Paciente de prueba", demo, clínica CRM-4821, terapeuta Diego, consentimiento, plan v1: Movilidad nivel 1 3 min y Caja nivel 2 6 min, mano derecha, meta 12, umbral de dolor 5; sin sesiones). `compartir_metricas = false`: el terapeuta NO lo ve (no aparece en sus pantallas ni en verify:db).
- e2e: `entrarComo(context, 'prueba')`, `clienteComo('prueba')`, `crearSesion(juego, durMin, meta, nivel, 'prueba', { estado: 'en curso', metricas, dolor_eva, inicio, ... })` (e2e/juegos.ts) y en el `finally` **`limpiarPrueba(ids)`** (pasar siempre los ids: sin ids borra todo lo del paciente de prueba y rompería otra prueba en paralelo). Restos de corridas fallidas: ver `limpiarRestos` en `e2e/flujo-paciente.spec.ts`.
- Script: `npx tsx scripts/limpiar-prueba.ts [id ...]` → RPC `limpiar_paciente_prueba(p_ids)` (migración 000007, solo service_role): borra sesiones (también cerradas), eventos, alertas y auditoría SOLO de ese paciente. `npm run db:seed` también lo deja limpio (reset_demo). Captura: `npm run captura -- <ruta> <nombre> --como prueba`.
- Para comparar contra una sesión anterior, crear sesiones 'en curso' con métricas e `inicio` conocidos y abrir su /resumen (las cierra). Usar combinaciones juego/nivel propias de cada prueba (flujo-paciente usa Caja nivel 1 y nivel 2).

## Resumen de sesión (F13, hecho) — `/sesion/:id/resumen`

- `src/screens/sesion/Resumen.tsx`: el cargador lee la sesión; si está 'en curso' con `metricas` y `dolorEVA`, la CIERRA con `repos.sesiones.cerrar(id)` (nuevo en `SesionesRepo`: vacía la cola local, falla si hay pendientes, relee sesión + eventos de la BD, `hashSesion`, `update estado='cerrada', hash` filtrando `estado='en curso'`; idempotente). Si el cierre falla muestra el resumen con aviso + "Reintentar". Sin dolor → enlace a /sensacion; 'preparada' o sin métricas → "todavía no se juega".
- Muestra: subtítulo `<juego> · m:ss min (jugado) · Nivel N`, anillo `contador/meta <meta.unidad del juego>` + insignia "Meta cumplida"/"Meta no alcanzada", barras Izq./Der. (`agarresIzq/Der`), tarjetas = `tarjetasResumen(modulo.metricasResumen)` (con unidad o `tarjeta: true`, ≤ 5, título `corto ?? nombre`, "aprox." si `aprox`) + "Dolor reportado" (EVA/10 + banda), diferencia contra `sesionAnterior` (última cerrada mismo juego y nivel) y "Comparado con tu sesión del 20 nov". "Ver mi progreso" → /progreso.
- Lógica pura `src/metrics/resumen.ts` (+ `resumen.test.ts`): `tarjetasResumen`, `valorMetrica(def, metricas)` (lee `metricas.juego`; sesiones del seed sin `juego` → agregados base si coinciden id y unidad), `sesionAnterior`, `diferencia` (pts para %, tono mejor/otro/neutro según `mejor`), `bandaDolor`, `duracionTexto`, `avanceMeta`. **F14 Progreso / F15 Historial pueden reusarlas.**
- Contrato J0: `DefMetrica` tiene `corto?` y `tarjeta?` (opcionales). Juegos nuevos (F22–F27): poner `corto` si el nombre es largo y dejar los conteos sin unidad (van al anillo).
- `<Estados r vacio?>`: si el cargador devuelve `null` muestra `vacio` (por defecto "No encontramos esto"). Ya no hace falta devolver `{ datos: null }`.
- e2e `e2e/flujo-paciente.spec.ts` (2): flujo UI completo preparar→calibrar→jugar→Terminar→sensación→resumen con el paciente de prueba (cerrada, hash `verificarSesion` = verificado en el navegador, inmutable, sin diferencias) y diferencias A→B con oráculo. `CAPTURA_RESUMEN=1 npm run e2e -- flujo-paciente -g diferencias` → `docs/capturas/resumen.png`. `e2e/sensacion.spec.ts` "sesión real" ahora usa el paciente de prueba y bloquea el PATCH de cierre.
- Estilos: sección "resumen de sesión (F13)" en `src/index.css` (`.resumen-*`).

## Cuidado con

- Correr `bash init.sh` antes de nada. Si `npm install` borró los binarios nativos de Windows, init.sh los repone.
- Vitest solo corre `src/**/*.test.ts(x)` (vite.config.ts); las pruebas de `e2e/` corren con `npm run e2e`.
- En `e2e/` los imports relativos llevan `.ts` (tsconfig.node.json usa nodenext).
- Git Bash convierte `/ruta` en ruta de Windows: `scripts/captura.mjs` lo deshace; para otros comandos usar `MSYS_NO_PATHCONV=1`.
- Pantallas siempre vía `repos`, no `supabase` directo.
- `<Estados>`: desde F13 un cargador que devuelve `null` muestra el estado vacío (prop `vacio`). Las pantallas antiguas que devuelven `{ datos }` siguen funcionando.
- **Nunca abrir /resumen de una sesión real de Carmen en un e2e**: la cierra para siempre (hasta `npm run db:seed`) y `verify:db` falla (≠ 19 sesiones). Usar el paciente de prueba.
- e2e de "nada sale de la app" (`tracking`): se permiten solo GET a fonts.googleapis.com / fonts.gstatic.com. Si F18/F20 autoalojan las fuentes, quitar esa excepción.
- Fechas: el seed usa la fecha del día en que se corre. Si las vistas se ven vacías, `npm run db:seed`.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad, PWA instalada, modo avión, rendimiento.
- Medir con regla y goniómetro (docs/validacion.md, F21).

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK.
2. `node scripts/siguiente-feature.mjs` → F14 esperado.
3. Marcarlo `in-progress` y seguir CLAUDE.md. Si sus e2e cierran sesiones o necesitan sesiones cerradas nuevas: paciente de prueba (sección de arriba). Reusar `src/metrics/resumen.ts` para valores y comparaciones por juego (`metricasResumen` del módulo vía `cargarModulo(juego)` → `crear().metricasResumen`).
