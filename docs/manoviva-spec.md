# ManoViva — especificación técnica

App web móvil de rehabilitación de manos, para pacientes y terapeutas, medible y trazable.
Este archivo es la salida del Prompt 0 y lo leen todos los features siguientes.
Material fuente: `docs/referencia/` (prompts 00–15, juegos J0–J6 e imágenes de cada vista).

## 1. Stack (decidido, no cambiar sin anotarlo en progress.md)

| Capa | Elección | Nota |
| --- | --- | --- |
| Build | Vite 8 + React 19 + TypeScript | Puerto dev 5174 |
| Rutas | react-router-dom 7 (`BrowserRouter`) | `vercel.json` reescribe a `index.html` |
| Gráfico 3D de los juegos | **three.js directo** (sin React Three Fiber) | Cada juego monta su escena en un `<canvas>` |
| Física | `@dimforge/rapier3d-compat` | Solo en juegos que mueven objetos (Caja, Torre) |
| Manos | `@mediapipe/tasks-vision` HandLandmarker | Modelo y wasm servidos desde `public/mediapipe/` |
| Datos | Supabase (Postgres + RLS + Auth) | Proyecto `manoviva`, ref `iniposctftmzxkqasikh`, São Paulo |
| Cola sin conexión | Dexie (IndexedDB) | `src/data/colaLocal.ts` |
| Gráficos 2D | Recharts | Progreso, prescripción |
| PDF / CSV | jsPDF + jspdf-autotable / CSV propio | Exportación de historial |
| Pruebas | Vitest (unitarias) + Playwright (e2e) + `scripts/verificar-rls.ts` (BD real) | |
| Deploy | Vercel CLI, proyecto `manoviva` | https://manoviva-sigma.vercel.app |

Diferencia con el Prompt 0: el prompt pedía "primera implementación local con IndexedDB". Se decidió Supabase
como fuente de verdad detrás de las mismas interfaces (`src/data/repos.ts`) y IndexedDB solo como cola de
escrituras pendientes. Las pantallas nunca llaman a Supabase directo: siempre a `repos`.

## 2. Sistema de diseño

- Tema oscuro. Fondo `#0f1720`, tarjetas `#1a2733`, borde `rgba(255,255,255,.07)`, texto `#eef3f7`, secundario `#9fb0bf`.
- Acento `#ffc83d`, éxito `#4fd1a1`, alerta `#ff8a5c`, información `#5ab0ff`.
- Títulos Poppins 700; texto DM Sans. Radios 14–18 px. Botón principal 52 px de alto, fijo abajo (`BarraAccion`).
- Accesibilidad motora: zonas táctiles ≥ 48 px, texto ≥ 14 px, nada que exija gestos finos (sin arrastrar, sin doble toque).
- Español de Chile, decimales con coma: usar siempre `src/lib/formato.ts` (`num`, `pct`, `fechaCorta`…).
- Tokens y clases en `src/index.css`. Componentes compartidos en `src/ui/piezas.tsx` e íconos en `src/ui/Icono.tsx`.
- Cada pantalla tiene estados de carga, vacío y error (`Cargando`, `Vacio`, `ErrorEstado`, `Estados`).

## 3. Rutas

| Ruta | Rol | Vista (imagen de referencia) |
| --- | --- | --- |
| `/acceso` | público | 01_acceso.png |
| `/inicio` | paciente | 02_inicio_paciente.png |
| `/ejercicios` | paciente | 03_ejercicios.png |
| `/sesion/:juego/preparar` | paciente | 04_preparar_sesion.png |
| `/sesion/:id/calibrar` | paciente | 05_calibracion.png |
| `/sesion/:id/jugar` | paciente | 06a/06b (Caja) y imagenes_juegos/0N (otros juegos) |
| `/sesion/:id/sensacion` | paciente | 07_dolor_y_esfuerzo.png |
| `/sesion/:id/resumen` | paciente | 08_resumen_sesion.png |
| `/progreso` | paciente | 09_progreso.png |
| `/historial`, `/historial/:id` | paciente (y terapeuta vía paciente) | 10a, 10b |
| `/perfil` | paciente | sin imagen: datos, largo de mano, privacidad, salir |
| `/privacidad` | paciente | 13_privacidad.png |
| `/terapeuta/pacientes` | terapeuta | 11_terapeuta_pacientes.png |
| `/terapeuta/pacientes/:id/plan` | terapeuta | 12_prescripcion.png |
| `/terapeuta/alertas`, `/terapeuta/planes`, `/terapeuta/informes` | terapeuta | pestañas de la barra inferior (sin imagen) |
| `/depuracion` | ambos (modo depuración) | Prompt 15: validación de mediciones |

## 4. Modelo de datos (Supabase, `supabase/migrations/`)

Tablas: `clinicas`, `perfiles` (Usuario), `pacientes`, `planes` (versionados), `sesiones`, `eventos_sesion`,
`auditoria`, `consentimientos`, `alertas`, `citas`. Tipos de dominio en `src/domain/types.ts`.

- Sesión: id legible `S-AAAAMMDD-NN` (RPC `siguiente_id_sesion`), estados `preparada | en curso | cerrada`.
  Guarda parámetros congelados, versión del plan, calibración, métricas agregadas, muestras a 10 Hz,
  dolor EVA, esfuerzo, nota, dispositivo, versión de app y de modelo, y hash.
- EventoSesion: `(sesion_id, seq)` único; tipos permitidos en el `check` de la tabla. **Cada juego nuevo que
  declare eventos propios necesita una migración que amplíe ese `check`.**
- Planes: nunca se editan. `crear_version_plan` crea la versión N+1 y escribe auditoría antes/después.
- RPC disponibles: `verificar_acceso`, `crear_version_plan`, `actualizar_privacidad`, `marcar_mensaje_visto`,
  `revisar_alerta`, `eliminar_mis_datos`, `siguiente_id_sesion`, `reset_demo` (solo service_role, solo datos demo),
  `limpiar_sesiones_prueba(p_desde, p_ids)` (solo service_role: borra sesiones demo no cerradas de pruebas, F09),
  `limpiar_paciente_prueba(p_ids)` (solo service_role: borra sesiones —también cerradas—, eventos, alertas y auditoría
  solo del paciente de prueba `prueba.demo@example.com`, F13).

## 5. Reglas invariantes

1. El video de la cámara nunca se guarda ni se envía. Solo puntos de la mano, eventos y métricas.
2. Sesión cerrada = inmutable (trigger en BD). Correcciones = registro nuevo en auditoría.
3. Auditoría es de solo agregar (trigger). No existe código que edite o borre auditoría o sesiones cerradas.
4. Integridad: SHA-256 (Web Crypto) sobre JSON canónico de sesión + eventos (`src/domain/integridad.ts`).
5. Fórmulas de métricas = funciones puras con pruebas en `src/metrics/`.
6. Describir datos, no interpretarlos: sin diagnósticos ni recomendaciones automáticas.
7. La cámara no mide fuerza: prohibido mostrar "fuerza" o "presión" en cualquier juego o resumen.
8. Medidas en cm y grados son estimaciones de una cámara: mostrar "aprox." donde corresponda.

## 6. Seguimiento de manos y distancia (módulo `src/tracking/`)

- `HandLandmarker`: `runningMode: "VIDEO"`, `numHands: 2`, delegate GPU con respaldo CPU.
- Cámara frontal `getUserMedia({ facingMode: 'user', width: 640, height: 480, frameRate: 30 })`, `<video playsinline muted>`.
- Procesar solo el cuadro más reciente; medir fps; evaluar Web Worker si baja de 24 fps.
- Suavizado One Euro (`src/tracking/oneEuro.ts`, ya probado).
- **Fuente de manos intercambiable**: `camara | grabacion (JSON) | sintetica`. Se elige con `?fuente=` y en
  `/depuracion`. Es lo que permite probar juegos y flujos sin cámara (e2e y agente autónomo).
- Lateralidad: MediaPipe reporta la mano asumiendo imagen espejada; verificar en teléfono real que izquierda/derecha
  no queden invertidas (queda como verificación manual pendiente si no hay teléfono).

### Distancia cámara–mano de bajo cómputo (decisión)

No se agrega ningún modelo extra. Se estima con los mismos datos que ya entrega HandLandmarker:

1. **Ajuste de perspectiva débil con worldLandmarks (principal)**. MediaPipe entrega cada punto en la imagen (px) y
   en coordenadas "mundo" en metros (forma 3D de la mano, centrada en la mano y orientada como la cámara).
   Escala por mínimos cuadrados entre ambos, sobre los puntos centrados de la palma (0, 5, 9, 13, 17) y luego todos:
   `s = Σ(uᵢ·Xᵢ + vᵢ·Yᵢ) / Σ(Xᵢ² + Yᵢ²)` (px por metro), y `Z ≈ f / s`.
   Usa los 21 puntos, tolera dedos flexionados y la inclinación de la mano mejor que medir un solo segmento.
   Costo: ~100 operaciones por cuadro.
2. **Escala con regla**: si el perfil tiene `largoManoCm` medido con regla, se corrige la escala del mundo con
   `largoRegla / largoMundo` (MediaPipe usa un tamaño de mano promedio).
3. **Focal**: `f ≈ 0,8 × ancho` (campo horizontal ~64° de cámaras frontales). Es la mayor fuente de error.
   Opcional en `/depuracion`: calibrar la focal del dispositivo poniendo la mano a una distancia medida.
4. **Respaldo**: modelo pinhole con largo de mano en px (ya en `src/metrics/geometria.ts::distanciaAproxCm`).
5. Suavizar con One Euro y mostrar siempre como "aprox.".

Descartados: modelos de profundidad monocular (MiDaS, Depth Anything: pesados y de profundidad relativa),
OpenCV.js `solvePnP` (~8 MB de wasm para resolver algo que el ajuste de escala hace en microsegundos),
WebXR depth (no disponible con cámara frontal), MediaPipe Iris (es para la cara).

## 7. Contrato de juego (J0, `src/games/shell/`)

Contrato final (F09) en `src/games/shell/contrato.ts`. Cada juego vive en `src/games/<juego>/modulo.ts`, exporta una
fábrica `crear(): ModuloJuego` y se registra en `src/games/shell/modulos.ts` (import diferido). Ejemplo mínimo:
`src/games/prueba/modulo.ts` (`prueba-shell`, y `prueba-fisica` con Rapier).

```ts
interface ModuloJuego {
  id: string; nombre: string; gestos: Gesto[]; miniatura: string
  niveles: Record<1|2|3|4|5, ParametrosNivel>            // { nombre, detalle, ...lo propio del juego }
  meta: { etiqueta: string; unidad: string; desdePlan: (p: PlanItem | ParametrosSesion) => number }  // 0 = sin meta
  tiposEvento: TipoEvento[]                              // deben existir en el check de eventos_sesion
  metricasVivo: DefMetrica[]                             // hasta 3, la primera con minigráfico
  metricasResumen: DefMetrica[]                          // { id, nombre, unidad, formula, decimales?, aprox?, mejor? }
  usaFisica: boolean                                     // true → la base carga Rapier y avanza el mundo a 60 Hz
  pista: string; textoReiniciar?: string                 // panel izquierdo
  montar(ctx: ContextoJuego): void | Promise<void>       // una vez por instancia
  actualizar(manos: ManoSeguida[], dt: number): void     // cada cuadro, solo jugando (no en pausa)
  hud(): { contador; vivo: Record<id, number|null>; manos?: { izquierda?, derecha?: { texto, tono } }; pista? }
  reiniciar?(): void                                     // botón amarillo
  muestra?(): Record<string, number | null>              // canales propios a 10 Hz → muestras.canales
  resumen?(base: EntradaAgregados): Record<string, number | null>   // → metricas.juego
  desmontar(): void
}
// ContextoJuego: escena, camara, mesa {ancho, fondo, altura, z, objeto}, manos (ManosVirtuales: punto(lado, i),
// palma(lado), visible(lado)), fisica {RAPIER, mundo} | null, sesion, parametros, nivel, meta, calibracion, escalaCm,
// fuente, registrar(tipo, {mano, objeto, datos}), medidas(lado) → {aperturaPinzaCm, apertura, aperturaCalibrada,
// flexion, muneca, distanciaCm} | null, manoPrincipal(), ahora() (ms de juego activo), configurarManos(zona).
```

- La base común (`games/shell`) pone: canvas three.js con mesa, luces, cámara y manos virtuales; HUD (panel izquierdo,
  barra superior tiempo/contador/meta, métricas en vivo abajo a la izquierda, miniatura de cámara, botón "Menú");
  ciclo de sesión (inicio al ver la mano, pausa manual con Menú, pausa automática si se pierde la mano > 2 s que se
  reanuda sola, término por tiempo o meta con aviso "¡Meta cumplida!"); registro de eventos (`pausa`, `reanudar`,
  `perdida_seguimiento` + los del juego) y muestras a 10 Hz; Wake Lock; aviso "Gira tu teléfono"; pixel ratio ≤ 1,5
  con calidad adaptativa; fps con `?depuracion=1`.
- Al terminar guarda `metricas` (agregados base + `juego`, `contador`, `meta`, `motivoFin`), `muestras` y `fin`; la
  Sesion sigue 'en curso' y se va a `/sesion/:id/sensacion` conservando el query. El cierre con hash es de /resumen.
- Resumen y progreso leen `metricasResumen` del juego, no asumen las de Caja de juguetes.

## 8. Juegos

| id | Juego | Gesto | Física | Prompt |
| --- | --- | --- | --- | --- |
| `caja-juguetes` | Caja de juguetes | Pinza, agarre, traslado | Rapier | 06 |
| `movilidad-guiada` | Movilidad guiada (calentamiento, agregado) | Abrir y cerrar | No | — |
| `torre-cubos` | Torre de cubos | Pinza y precisión | Rapier | J1 |
| `pinza-fina` | Pinza fina | Oposición del pulgar | No | J2 |
| `atrapa-burbujas` | Atrapa burbujas | Alcance y extensión | No | J3 |
| `exprime-naranja` | Exprime la naranja | Cierre de puño | No | J4 |
| `memoria-cartas` | Memoria de cartas | Giro del antebrazo | No | J5 |
| `piano-dedos` | Piano de dedos | Independencia de dedos | No | J6 |

Un juego aparece como "Próximamente" en `/ejercicios` hasta que su feature esté `done`.

## 9. Datos de demostración (ficticios)

`npm run db:seed` (re-ejecutable; borra solo datos `demo`). Clínica `CRM-4821`, contraseña `manoviva-demo`.
Terapeuta `terapeuta.demo@example.com`; pacientes `carmen|luis|marta|jorge.demo@example.com`.
Paciente de PRUEBA `prueba.demo@example.com` (no comparte métricas: el terapeuta no lo ve): lo usan los e2e que cierran
sesiones; se limpia con `npx tsx scripts/limpiar-prueba.ts [id ...]`.
La pantalla de acceso ofrece "Entrar con cuenta demo" y un aviso visible de datos ficticios.

## 10. Estructura de carpetas

```
src/
  domain/      tipos, integridad (hash, ids)
  metrics/     funciones puras + pruebas
  tracking/    HandLandmarker, fuentes de manos, One Euro, distancia
  games/       registry.ts, shell/ (base común), <juego>/ (un módulo por juego)
  data/        repos.ts (interfaces), supabaseRepos.ts, colaLocal.ts, supabase.ts
  auth/        contexto de sesión y protección de rutas
  screens/     una carpeta por área: acceso, paciente, sesion, terapeuta, privacidad, depuracion
  ui/          piezas compartidas e íconos
  lib/         formato es-CL, utilidades
scripts/       seed.ts, verificar-rls.ts
supabase/      migrations/
e2e/           pruebas Playwright (fuente de manos sintética)
docs/          spec, validacion.md, referencia/, capturas/
```
