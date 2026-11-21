# ManoViva — progreso

Registro de sesiones (solo agregar al final). Cada entrada: fecha, feature, qué se hizo (What), verificación con resultado (Evidence), siguiente paso (Next).

## Estado actual (Current State)

- Last Updated: 2026-11-21
- Hecho: F00 base, F01 harness, F02 esqueleto, F03 acceso, F04 inicio del paciente, F05 catálogo de ejercicios, F06 preparar la sesión, F07 módulo de seguimiento de manos (sin pantalla propia). El resto de las pantallas siguen provisorias. Deploy de producción al día con F06.
- Siguiente (Next): ver `node scripts/siguiente-feature.mjs` y `session-handoff.md`.

## Decisiones

Ambigüedades resueltas sin el dueño. Agregar aquí, con fecha y motivo.

- 2026-11-21 · Supabase es la fuente de verdad (el Prompt 0 pedía IndexedDB primero). IndexedDB queda como cola de escrituras pendientes. Motivo: el dueño pidió montarlo en Supabase y Vercel.
- 2026-11-21 · Autenticación real con correo y contraseña además de rol y código de clínica (el diseño solo muestra rol y código). Se agrega "Entrar con cuenta demo" para que la demo se use con un toque.
- 2026-11-21 · Juegos en three.js directo, sin React Three Fiber (pedido del dueño). Física con `@dimforge/rapier3d-compat` solo en juegos que mueven objetos.
- 2026-11-21 · Distancia cámara–mano: ajuste de perspectiva débil con worldLandmarks de MediaPipe, sin modelos extra (ver spec §6).
- 2026-11-21 · Se agrega el ejercicio "Movilidad guiada" (calentamiento) porque el diseño de Inicio y el plan demo lo incluyen; no está en los prompts.
- 2026-11-21 · Adherencia: sesiones planificadas por semana = días de práctica × ejercicios del plan.
- 2026-11-21 · Flexión de un dedo = flexión MCP + PIP (la DIP de MediaPipe es más ruidosa). Suavidad = SPARC por segmento de traslado, escala 0–100 entre −6 y −1,6.
- 2026-11-21 · ID de sesión correlativo global por día (RPC con lock), porque `S-AAAAMMDD-NN` es la clave primaria.
- 2026-11-21 · `reset_demo()` puede borrar auditoría solo de datos demo y solo con service_role, para que el seed sea re-ejecutable.
- 2026-11-21 · (F02) Rutas por rol: `/historial` y `/historial/:id` aceptan paciente y terapeuta (spec: "terapeuta vía paciente"); la barra inferior se elige según el rol. `/depuracion` acepta ambos, sin barra.
- 2026-11-21 · (F02) Con barra: /inicio, /ejercicios, /progreso, /historial(/:id), /perfil y las 4 pestañas del terapeuta. Sin barra: flujo /sesion/*, /privacidad (se llega desde Perfil, imagen 13 sin barra), /terapeuta/pacientes/:id/plan (imagen 12 sin barra). /sesion/:id/jugar además sin banner (pantalla completa horizontal).
- 2026-11-21 · (F02) Banner "Datos de demostración ficticios" (franja azul arriba) solo si el perfil tiene `demo = true`; no está en las imágenes, lo pide F02.
- 2026-11-21 · (F02) Rol equivocado → inicio del propio rol con aviso de error; ruta desconocida o "/" → inicio del rol o /acceso. /acceso con sesión abierta → inicio del rol (ignora `state.desde`; F03 puede usarlo).
- 2026-11-21 · (F02) Pantallas con `React.lazy` (salvo /acceso) para que three.js/MediaPipe de los juegos no carguen en el inicio.
- 2026-11-21 · (F02) Perfil provisorio con "Cerrar sesión" para poder probar el ciclo de sesión antes de F19.
- 2026-11-21 · (F02) Playwright levanta su propio vite en :5176 (5174 = dev, 5175 = captura). La sesión e2e se inyecta en localStorage `manoviva-auth` una vez por pestaña (sessionStorage como marca) para que "cerrar sesión" se pueda probar. vitest se limita a `src/**/*.test.ts`; `e2e/` y `playwright.config.ts` se tipan con tsconfig.node.json.
- 2026-11-21 · (F03) Sin rol preseleccionado al abrir /acceso: el prompt pide "Ingresar" deshabilitado hasta tener rol y código; la imagen muestra el estado ya llenado. `?rol=paciente|terapeuta&codigo=CRM-0000` prellena el formulario (sirve como enlace de la clínica y para la captura `acceso-lleno`).
- 2026-11-21 · (F03) "Tu terapeuta te entrega este código" va como ayuda bajo el campo de código (en la imagen está bajo Ingresar): con correo y contraseña en medio, bajo el botón ya no se entendería a qué código se refiere. Si hay error de formato, el error reemplaza esa ayuda.
- 2026-11-21 · (F03) Código: se normaliza al escribir (mayúsculas, sin espacios, guion automático en "CRM4821", máx. 8). Error en vivo apenas lo escrito ya no puede ser CRM-0000; si queda incompleto, al salir del campo.
- 2026-11-21 · (F03) "Entrar con cuenta demo" llena los campos y entra en un solo toque, con el rol elegido (sin rol → paciente: Carmen). Debajo, nota "La cuenta demo entra como … con datos ficticios".
- 2026-11-21 · (F03) Aviso de datos ficticios en /acceso = la misma franja `BannerDemo` de las pantallas con sesión (arriba, siempre visible).
- 2026-11-21 · (F03) "Código de otra clínica" y "rol equivocado" dan el mismo tipo de error ("Esta cuenta no es de paciente o no pertenece a esa clínica."): distinguirlos exigiría exponer la lista de clínicas a usuarios anónimos.
- 2026-11-21 · (F03) Cerrar sesión y el cierre tras verificación fallida usan `signOut({ scope: 'local' })` para no revocar la cuenta demo compartida en otros dispositivos (arregla el riesgo abierto de F02).
- 2026-11-21 · (F03) `location.state.desde` sigue ignorado: tras ingresar se va siempre al inicio del rol (lo que pide la aceptación).
- 2026-11-21 · (F03) Ícono nuevo `tendencia` en `src/ui/Icono.tsx` (tarjeta "Soy terapeuta"); `.rol` seleccionada usa tinte amarillo sobre el fondo (más oscuro, como en la imagen).
- 2026-11-21 · (F04) Plan de hoy = todos los ítems del plan vigente, todos los días (el plan solo guarda días por semana, no cuáles). Un ítem está "Hecho" si hoy hay una sesión cerrada de ese juego (cada sesión cubre un ítem, en orden); el primero no hecho es "Siguiente", el resto "Pendiente". Función pura `planDeHoy` en `src/metrics/sesion.ts` con pruebas. Si todo está hecho: anillo lleno y "¡Completaste el plan de hoy!".
- 2026-11-21 · (F04) Solo la fila "Siguiente" es tocable (enlace a `/sesion/<juego>/preparar`, con el id del registro, p. ej. `caja-juguetes`). Hecho y Pendiente no navegan.
- 2026-11-21 · (F04) Mensaje del terapeuta: se muestra si `plan.mensaje` existe y `plan.version > paciente.ultimoMensajeVisto`; se marca visto (RPC `marcar_mensaje_visto`) apenas aparece, así al volver ya no se ve aunque no se cierre. Queda en pantalla hasta cerrarlo con la X. Va arriba, bajo el saludo. El e2e simula "no visto" interceptando la respuesta de `pacientes` (la RPC usa greatest y no se puede revertir sin service_role).
- 2026-11-21 · (F04) Tira L–D: cumplido = sesiones del día ≥ ejercicios del plan (verde); parcial = torta amarilla proporcional (`semana()` ahora devuelve `hechas`); día pasado sin práctica = círculo gris lleno; hoy sin práctica y días futuros = círculo punteado. Letra de hoy en amarillo.
- 2026-11-21 · (F04) Estados: sin ficha de paciente o sin plan (o plan sin ítems) → vacío con "Ver ejercicios" (y la cita si hay); error → `ErrorEstado` con Reintentar; el saludo se ve siempre. Nuevo hook `src/lib/useCarga.ts` (estado/datos/error/recargar) para usar con `<Estados>`.
- 2026-11-21 · (F04) h1 de /inicio = "Hola, <primer nombre> 👋" (sin título "Inicio"); `e2e/smoke.spec.ts` espera /^Hola/. Avatar con iniciales no navega. "Indicado por" usa `creadoPorNombre` (título + nombre) o "tu terapeuta". `formato.ts` suma `diaSemana()` para la cita ("Jueves 26 nov · 11:00 · presencial").
- 2026-11-21 · (F04) `e2e/ayudas.ts` suma `clienteComo(como)`: cliente Supabase con la sesión demo ya obtenida (sin ingreso extra) para que los e2e comparen la pantalla con la BD.
- 2026-11-21 · (F05) El catálogo muestra los 8 juegos del registro (spec §8) en su orden: Caja, Movilidad guiada, Torre, Pinza fina, Atrapa burbujas, Exprime la naranja, Memoria de cartas, Piano de dedos. Disponibles = `disponible: true` del registro (Caja y Movilidad, porque el plan demo y /inicio ya enlazan Movilidad a preparar); el resto "Próximamente". Cada feature de juego debe poner `disponible: true` al cerrarse.
- 2026-11-21 · (F05) Filtros: Torre = Pinza + Agarre (la imagen de juegos dice "pinza y precisión"); Exprime la naranja = Agarre; Memoria de cartas y Piano de dedos no calzan con Pinza/Agarre/Alcance y solo aparecen en "Todos" (el prompt fija esos 4 filtros). El filtro elegido va en la URL (`?gesto=Pinza`) para recordarlo al volver.
- 2026-11-21 · (F05) Nivel actual = nivel del ítem del plan vigente (si se repite, el mayor); si no está en el plan, el de la última sesión cerrada de ese juego; si nunca lo jugó, 1. Función pura `nivelActual`/`catalogo` en `src/games/catalogo.ts` con pruebas.
- 2026-11-21 · (F05) "Próximamente" = insignia gris + miniatura atenuada; la tarjeta es un `div` con `aria-disabled` (sin enlace ni aviso al tocar). Si un juego está asignado y además es Próximamente se ven ambas insignias.
- 2026-11-21 · (F05) Miniaturas SVG propias en `src/games/Miniatura.tsx` (clave = `Juego.miniatura`): caja, movilidad, torre, pinza, burbujas, naranja, memoria, piano.
- 2026-11-21 · (F06) Valores por defecto = primer ítem del plan vigente con ese juego (mano, nivel, duración, metas, autor = `creadoPorNombre`). Juego fuera del plan: mano afectada del paciente, nivel de la última sesión cerrada (o 1), 5 min y "Práctica libre" sin meta (se guarda metaAgarres/metaPinzaCm 0 y prescritoPor null). `planVersion` = versión del plan vigente (null si no hay plan). Función pura `valoresPorDefecto`/`sesionPreparada` en `src/games/preparar.ts` con pruebas.
- 2026-11-21 · (F06) `parametros.prescritoPor` guarda el nombre visible del autor ("Klgo. Diego M."), igual que el seed, no el uuid.
- 2026-11-21 · (F06) Dificultad: las 5 barras de la imagen son botones (zona táctil 48 px) para elegir nivel; bajo la barra se muestra `NivelJuego.detalle` (campo nuevo del registro: qué cambia en cantidad, tamaño y distancia a la caja). El paciente puede cambiar nivel/duración/mano; la meta queda bloqueada.
- 2026-11-21 · (F06) Duración: botones −/+ a los lados del deslizador (el prompt los pide; la imagen solo muestra el deslizador). Paso 1 min, límites 2–10.
- 2026-11-21 · (F06) Consentimiento: se revisa al cargar la pantalla (no al tocar Comenzar). Sin consentimiento → aviso + `navigate('/privacidad', { replace, state: { volver: '/sesion/<juego>/preparar?…' } })`. F18 (privacidad) debe usar `state.volver` para regresar tras firmar.
- 2026-11-21 · (F06) Juego inexistente o "Próximamente" en /sesion/:juego/preparar → mensaje "Este ejercicio no está disponible" con enlace a /ejercicios (no se crea sesión). `?fuente=` se conserva al ir a /calibrar. Cada "Comenzar" crea una sesión preparada nueva (no se reutilizan).
- 2026-11-21 · (F06) `versionApp`, `dispositivo` y `versionModelo` quedan null en la sesión preparada: los llena la calibración/juego/cierre.
- 2026-11-21 · (F06) Limpieza de e2e: `scripts/limpiar-preparadas.ts <ISO desde>` (service_role, como manda CLAUDE.md: solo scripts/) borra sesiones `preparada` de pacientes demo creadas desde esa fecha; `e2e/preparar.spec.ts` lo llama en un `finally` de la única prueba que crea sesión. Smoke usa ahora `/sesion/caja-juguetes/preparar` (título "Caja de juguetes").
- 2026-11-21 · (F07) Estados de la fuente: los 4 del prompt (`sin permiso | buscando | detectada | perdida`) + `iniciando`, `sin camara` y `error`, porque F08 debe explicar "sin cámara" y fallos de modelo. `perdida` = había mano y lleva ≥ 300 ms sin verse (evita parpadeos); la pausa de 2 s la decide F09 con `fuente.ultimaDeteccion`.
- 2026-11-21 · (F07) Convención de coordenadas única para todas las fuentes = la de MediaPipe sobre el video SIN espejo (landmarks normalizados, world en metros). Dibujar en espejo es tarea de la vista (`espejarX`). La mano derecha del sujeto queda a la izquierda de la imagen cruda, pulgar hacia +x (así la genera la sintética).
- 2026-11-21 · (F07) Lateralidad: etiqueta de MediaPipe 'Right' → 'derecha' (según la nota del d.ts de tasks-vision 1.2.3: es la mano del sujeto con imagen sin espejo). `?lateralidad=invertida` la invierte para probar en teléfono. Sigue pendiente de verificación con teléfono real.
- 2026-11-21 · (F07) Distancia: la fórmula del spec se usa en su forma invariante a rotación en el plano y a espejo (Procrustes 2D: s = √(a²+b²)/ΣX², probando también u → −u). Con imagen y mundo alineados es idéntica a la del spec. Ajuste con los 21 puntos y referencia al centro de la palma (0,5,9,13,17) corrigiendo con la diferencia de z del mundo (con el puño los dedos quedan más cerca). Distancia = cámara → centro de la palma. Error con mano sintética proyectada: máx. 2,0 % en 40/50/60 cm (abierta, puño, pinza, esquina, girada/inclinada).
- 2026-11-21 · (F07) One Euro: la cámara suaviza landmarks e world por lado (1,0 / 0,02); las fuentes simuladas no suavizan (la grabación ya guarda lo suavizado). `EstimadorDistancia` suaviza su propia salida.
- 2026-11-21 · (F07) MediaPipe Tasks envía telemetría (POST https://odml.pa.googleapis.com/v1/log). Lo detectó el e2e de la cámara. Se corta en el navegador envolviendo `fetch` (responde 204 sin red) antes de cargar MediaPipe (`bloquearTelemetriaMediapipe` en camara.ts). El e2e verifica que no salga ninguna petición que no sea GET a la propia app (o Supabase).
- 2026-11-21 · (F07) GPU → CPU: si crear con GPU falla, CPU; además, si con GPU va < 8 fps en los primeros 2,5 s, cambia una vez a CPU (Chromium headless tiene GPU por software: 0,6 fps con GPU, ~18 fps con CPU). `?delegado=cpu|gpu` lo fuerza. Web Worker no se implementa todavía: se evalúa con el fps medido en teléfono (F09/F21).
- 2026-11-21 · (F07) Luminancia de la cámara: se dibuja el video en un lienzo de 32×24 cada 500 ms y se descarta. La sintética entrega `luz` del guion (140 por defecto; `fijarLuz(30)` simula poca luz).
- 2026-11-21 · (F07) Grabación: formato compacto propio (`manoviva-landmarks` v1, arreglos de 63 números por mano, 5 decimales, t relativo). Reproducción por muestreo y retención (sin interpolar) para que sea exactamente determinista. Demo en `public/grabaciones/demo.json` (guion `calibracion` a 15 fps, 149 cuadros, 140 KB), regenerable con `npx tsx scripts/generar-grabacion.ts`.
- 2026-11-21 · (F07) Sin dependencias nuevas. MediaPipe se importa con `import()` dentro de `camara.ts`, que a su vez se importa con `import()` desde `fuentes.ts`: no entra al bundle principal.
- 2026-11-21 · (F08) Pasos de la calibración (máquina pura `src/metrics/calibracion.ts`): 1) aperturaMano ≥ 0,8 durante 2 s seguidos; 2) 3 ciclos cerrada (≤ 0,3) → abierta (≥ 0,8); 3) pinza pulgar–índice ≤ 2 cm durante 0,4 s. Solo cuentan los cuadros con los 21 puntos dentro del marco guía; si se pierde la mano o sale del marco, el paso 1 y la pinza se reinician (las repeticiones del paso 2 se conservan).
- 2026-11-21 · (F08) Mano calibrada = la del lado de `parametros.mano` si aparece; si no (o 'ambas'), la de mayor confianza. Con 'ambas' se calibra una sola mano (la primera que se vea): la línea base es por sesión, no por mano.
- 2026-11-21 · (F08) Línea base guardada (`Calibracion`): largo = regla del perfil si existe (fuente 'regla'), si no el estimado (media de largoMano(world)·100); `largoManoEstimadoCm` siempre; apertura máx. de pinza = máximo de la distancia pulgar–índice (con la escala de la regla); rango abrir/cerrar = mín./máx. de aperturaMano; fps y confianza medios; `escalaCmPorUnidad` = regla / largo del mundo (cm por metro de mundo) o 100. Todo con los cuadros válidos (mano dentro del marco).
- 2026-11-21 · (F08) La calibración NO cambia el estado: la Sesion sigue 'preparada' (F09 la pasa a 'en curso' al empezar el juego). Sí llena `inicio` (momento en que se abrió la calibración, si estaba vacío), `calibracion`, `dispositivo` ({ modelo: "Android 14 · Chrome 131" sin identificadores, camara: "frontal 640×480" | 'sintetica' | 'grabacion', fps }), `versionApp` (`src/lib/version.ts`, una prueba la compara con package.json) y `versionModelo` ("hand_landmarker.task · tasks-vision 1.2.3 · GPU|CPU" o "sintetica (sin modelo)"). Así `scripts/limpiar-preparadas.ts` sigue sirviendo para los e2e.
- 2026-11-21 · (F08) Al completar: píldora verde "¡Calibración lista!", guarda y a los 2 s navega sola a `/sesion/:id/jugar` conservando `?fuente=` (el teléfono está apoyado: no se pide tocar). Si falla el guardado: aviso + "Reintentar". Sin botón de volver arriba (la imagen no lo tiene); los estados de problema traen "Volver al inicio".
- 2026-11-21 · (F08) Vista: video/lienzo a pantalla completa bajo el banner (`.app:has(> .calibrar)` en columna de 100dvh); puntos pasados a la vista con espejo + object-fit: cover (`aVista`). Marco guía fijo en CSS (13 % a los lados, 150 px arriba, 250 px abajo); verde cuando los 21 puntos están dentro. Colores por dedo como la imagen (muñeca roja, pulgar naranjo, índice morado, medio amarillo, anular verde, meñique azul). Con fuente simulada (sin video) se dibuja una silueta gris de la mano y el antebrazo (`src/ui/dibujoMano.ts`).
- 2026-11-21 · (F08) Checklist: Iluminación (clasificarLuz: Buena/Poca/Excesiva), Distancia (EstimadorDistancia con la regla del perfil; ok entre 30 y 70 cm; "NN cm aprox."), Confianza (ok ≥ 70 %), Largo de la mano (con regla: valor de la regla y debajo "Regla · cámara 18,2 aprox."; sin regla: estimado "aprox."). Barra amarilla = avance total de los 3 pasos. Bajo la píldora: "Paso N de 3", o el consejo de luz/distancia si corresponde.
- 2026-11-21 · (F08) Permiso denegado: tarjeta con pasos para Android (Chrome) e iPhone (Safari), nota de que la imagen no se guarda ni se envía, "Reintentar" (vuelve a llamar `fuente.iniciar()`) y "Volver al inicio". Sin cámara y error de modelo tienen su propio texto y el detalle técnico en gris.
- 2026-11-21 · (F08) Arreglo mínimo en F07 (`src/tracking/sintetica.ts`): el preset `calibracion` ahora simula un teléfono vertical (cámara 480×640, mano centrada x = y = 0,5) para que la mano quepa en el marco con el recorte cover de 390×844; antes (640×480, x 0,42) el pulgar quedaba fuera. `public/grabaciones/demo.json` regenerado igual (149 cuadros). Los demás presets no cambian.
- 2026-11-21 · (F08) Nuevo `scripts/crear-preparada.ts [juego] [mano]`: crea una sesión 'preparada' de Carmen (anon + login demo) y escribe su id; sirve para `npm run captura -- "/sesion/<id>/calibrar?fuente=sintetica" calibrar` y para F09 (`/jugar`). Borrar luego con `limpiar-preparadas.ts`.

## Riesgos abiertos

- Node local 20.17 < 20.19 que pide Vite 8: `init.sh` reinstala binarios nativos de Windows. Arreglo definitivo: instalar Node 22 LTS.
- Registro público de Supabase Auth sigue activo: un extraño puede crear cuenta, pero sin perfil no ve datos (RLS). Desactivar en el panel de Supabase (Auth > Providers > Email > "Allow new users to sign up") antes de uso real.
- Lateralidad izquierda/derecha, instalación PWA y modo avión solo se pueden confirmar en un teléfono real.
- (F07) La focal 0,8 × ancho no está medida en un teléfono real: es la mayor fuente de error de la distancia. `focalDesdeDistanciaConocida` permite calibrarla (F21 /depuracion).
- (F07) Si una versión nueva de @mediapipe/tasks-vision cambia el endpoint de telemetría, el e2e `tracking` lo detecta (falla por petición saliente).
- Medidas en cm y grados no validadas contra regla/goniómetro hasta que un humano ejecute docs/validacion.md (F21).
- (Resuelto en F03) `repos.auth.salir()` ahora usa `signOut({ scope: 'local' })`.
- Las pruebas e2e de acceso hacen ingresos reales (≈7 por corrida): correr la suite muchas veces seguidas podría tocar el límite de ingresos por IP de Supabase Auth.

## Sesiones

### 2026-11-21 · F00 Base
- Proyecto Vite + React + TS en `manoviva/`. Supabase `manoviva` (São Paulo): 3 migraciones (esquema con RLS, triggers de inmutabilidad, RPCs; id de sesión; reset demo).
- Datos demo ficticios: 1 terapeuta, 4 pacientes, 42 sesiones con eventos y hash.
- Métricas puras: geometría (flexión, pinza, largo, distancia pinhole, luz), agarre con histéresis, SPARC, agregados, adherencia, racha, semana; One Euro; integridad SHA-256 canónica.
- Capa de datos: `repos.ts` + `supabaseRepos.ts` + cola Dexie. Estilos y piezas de UI base. Registro de juegos.
- Deploy provisorio: https://manoviva-sigma.vercel.app (página "en construcción").
- Verificación: `npm test` 25/25 · `npm run verify:db` 14/14 · build OK · deploy 200.

### 2026-11-21 · F01 Spec y harness
- `docs/manoviva-spec.md`, `CLAUDE.md`, `feature_list.json` (29 features), `init.sh`, `session-handoff.md`, `scripts/siguiente-feature.mjs`, `scripts/captura.mjs`. Permisos propuestos para trabajo autónomo en `docs/harness/permisos-sugeridos.json` (inactivos: activarlos es decisión del dueño).
- Material de referencia copiado a `docs/referencia/` (prompts 00–15, J0–J6, imágenes).
- Dependencias: se quitan @react-three/*; se agrega @dimforge/rapier3d-compat.
- Siguiente: F02.

### 2026-11-21 · F02 Esqueleto de la app
- Router (`src/App.tsx`) con las 19 rutas del spec §3, `AuthProvider` + `useAuth` sobre `repos.auth` (`src/auth/`), guardas `Protegida`/`SoloPublica`/`AlInicio`, `Marco` (banner demo + barra según rol + punto de alertas abiertas), `Avisos` global.
- `repos` exportado desde `src/data/repos.ts` (implementación activa = supabaseRepos).
- Pantallas provisorias en `src/screens/<area>/` (una por ruta, cada una dice qué feature la construye) con `EnConstruccion` de `src/ui/piezas.tsx`.
- `playwright.config.ts` + `e2e/ayudas.ts` (entrarComo, vigilarErrores) + `e2e/smoke.spec.ts`.
- Verificación: `npm run e2e -- smoke` 28/28 · `npm run captura -- /acceso esqueleto` OK · `bash init.sh` INIT OK.
- Siguiente: F03.

### 2026-11-21 · F03 Acceso y roles
- `/acceso` real (`src/screens/acceso/Acceso.tsx`): logo, nombre, lema, "¿Quién eres?" con dos tarjetas radio, código de clínica CRM-0000 validado en vivo (`src/auth/codigo.ts` + `codigo.test.ts`), correo, contraseña, Ingresar (deshabilitado hasta datos válidos), "Entrar con cuenta demo", franja de datos ficticios. Estilos en `src/index.css` (sección acceso), ícono `tendencia`.
- `supabaseRepos.auth`: `signOut({ scope: 'local' })` al salir y al rechazar rol/clínica; error de red distinto de credenciales malas.
- `e2e/acceso.spec.ts` (7 pruebas por la UI real).
- Verificación: `npm run e2e -- acceso` 7/7 · `npm run e2e` 35/35 · `npm run captura -- /acceso acceso` + `acceso-lleno` comparadas con 01_acceso.png · `bash init.sh` INIT OK.
- Siguiente: el que indique `node scripts/siguiente-feature.mjs`.

### 2026-11-21 · F04 Inicio del paciente
- `/inicio` real (`src/screens/paciente/Inicio.tsx`): fecha y saludo con avatar, mensaje nuevo del terapeuta (una vez), Plan de hoy con anillo hechos/total, minutos y autor, filas Hecho/Siguiente/Pendiente, Racha y Adherencia, tira L–D, próxima cita. Todo desde `repos` (paciente, plan vigente, sesiones, cita). Estilos en `src/index.css` (sección inicio).
- Nuevo: `planDeHoy` (+ `semana().hechas`) con pruebas, `useCarga`, `diaSemana`, `clienteComo` en e2e.
- `e2e/inicio.spec.ts` (6 pruebas: coherencia con BD, Siguiente, mensaje una vez, carga, vacío, error).
- Verificación: `npm run e2e -- inicio smoke` 34/34 · `npm run captura -- /inicio inicio` comparada con 02_inicio_paciente.png (+ inicio-mensaje.png) · `bash init.sh` INIT OK (31 unitarias).
- Siguiente: el que indique `node scripts/siguiente-feature.mjs`.

### 2026-11-21 · F05 Catálogo de ejercicios
- `/ejercicios` (`src/screens/paciente/Ejercicios.tsx`): filtros Todos/Pinza/Agarre/Alcance (`?gesto=`), tarjetas con miniatura SVG, gestos, 5 segmentos de nivel, "Asignado" según plan vigente y "Próximamente" sin navegar. Estados de carga/error con `useCarga` + `<Estados>`.
- Registro: +3 juegos (exprime-naranja, memoria-cartas, piano-dedos) como no disponibles, `FiltroGesto` y `FILTROS`. Nuevo `src/games/catalogo.ts` (+ pruebas) y `src/games/Miniatura.tsx`. Estilos en `src/index.css` (sección catálogo).
- Verificación: `npm run e2e -- ejercicios` 5/5 · `npm run e2e -- smoke inicio` 34/34 · vitest 35/35 · `bash init.sh` INIT OK · captura `docs/capturas/ejercicios.png`.
- Siguiente: F06 (preparar sesión).

### 2026-11-21 · F06 Preparar la sesión
- `/sesion/:juego/preparar` real (`src/screens/sesion/Preparar.tsx`): Mano a trabajar (Izquierda/Derecha/Ambas), Dificultad con 5 barras tocables + nombre y detalle del nivel desde el registro, Duración 2–10 con deslizador y −/+, Meta del plan bloqueada con candado y autor, consejo de posición, Comenzar fijo abajo. Sin consentimiento → /privacidad.
- Nuevo: `src/games/preparar.ts` (+ pruebas), `NivelJuego.detalle` en el registro, `scripts/limpiar-preparadas.ts`, estilos sección "preparar sesión" en `src/index.css`.
- Verificación: `npm run e2e -- preparar` 5/5 · `npm run e2e -- smoke inicio ejercicios` 39/39 · vitest 41/41 · `bash init.sh` INIT OK · captura `docs/capturas/preparar.png` · deploy prod 200 (/ y /acceso).
- Siguiente: F07 (módulo de seguimiento de manos).

### 2026-11-21 · F07 Módulo de seguimiento de manos
- `src/tracking/`: `tipos.ts` (FuenteManos, ManoSeguida, CuadroManos, estados), `fuenteBase.ts` (estado, fps, suscriptores), `camara.ts` (getUserMedia 640×480@30 frontal, HandLandmarker VIDEO 2 manos GPU→CPU, modelo y wasm locales, solo el último cuadro con requestVideoFrameCallback, One Euro, luz, corte de telemetría), `sintetica.ts` (modelo de mano + guiones con claves y presets), `fuenteSimulada.ts` (FuenteSintetica con control en vivo, FuenteGrabacion, reloj inyectable), `grabacion.ts` (grabador y lector JSON, reproducción determinista), `distancia.ts` (perspectiva débil + regla + focal calibrable + pinhole + EstimadorDistancia), `fuentes.ts` (`?fuente=` y fábrica), `useFuenteManos.ts` (hook).
- `public/grabaciones/demo.json` + `scripts/generar-grabacion.ts`. `e2e/tracking.spec.ts` (4 pruebas en Chromium con cámara falsa).
- Verificación: `npm test -- tracking` 40/40 · `npm run e2e -- tracking` 4/4 · `npm run e2e` 55/55 · `bash init.sh` INIT OK.
- Siguiente: F08 (pantalla de calibración).

### 2026-11-21 · F08 Calibración (pantalla)
- `/sesion/:id/calibrar` real (`src/screens/sesion/Calibrar.tsx`): video en espejo (o silueta con fuente simulada) con 21 puntos y conexiones, marco guía verde con "N/21 puntos", píldora con la instrucción del paso / "¡Calibración lista!", checklist en vivo (luz, distancia aprox., confianza, largo con comparación contra la regla) y barra de avance; guarda la línea base en la Sesion vía `repos.sesiones.actualizar` y sigue a /jugar. Estados: permiso denegado (instrucciones), sin cámara, error, poca luz, mano fuera del marco, sin mano, sesión inexistente o cerrada.
- Nuevo: `src/metrics/calibracion.ts` (+ pruebas), `src/ui/dibujoMano.ts`, `src/lib/version.ts` (+ pruebas), `scripts/crear-preparada.ts`, `e2e/calibrar.spec.ts`, estilos sección calibración en `src/index.css`. Preset sintético `calibracion` en vertical y demo.json regenerado.
- Verificación: `npm run e2e -- calibrar` 6/6 · `npm run e2e` 61/61 · vitest 92/92 · `bash init.sh` INIT OK · capturas `docs/capturas/calibrar.png`, `calibrar-lista.png`, `calibrar-permiso.png`.
- Pendiente de teléfono real: lateralidad con cámara frontal.
- Siguiente: F09 (base común de juegos J0).
