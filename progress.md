# ManoViva — progreso

Registro de sesiones (solo agregar al final). Cada entrada: fecha, feature, qué se hizo (What), verificación con resultado (Evidence), siguiente paso (Next).

## Estado actual (Current State)

- Last Updated: 2026-11-21
- Hecho: F00 base, F01 harness, F02 esqueleto (rutas, sesión, roles, barras, e2e), F03 acceso y roles (/acceso real con Supabase Auth). El resto de las pantallas siguen provisorias. El deploy sigue siendo la página provisoria de F00.
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

## Riesgos abiertos

- Node local 20.17 < 20.19 que pide Vite 8: `init.sh` reinstala binarios nativos de Windows. Arreglo definitivo: instalar Node 22 LTS.
- Registro público de Supabase Auth sigue activo: un extraño puede crear cuenta, pero sin perfil no ve datos (RLS). Desactivar en el panel de Supabase (Auth > Providers > Email > "Allow new users to sign up") antes de uso real.
- Lateralidad izquierda/derecha, instalación PWA y modo avión solo se pueden confirmar en un teléfono real.
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
