# Validación de las mediciones

Kuwü muestra apertura de pinza en cm, flexión de los dedos en grados y una suavidad del movimiento, todas como estimaciones de cámara
(«aprox.»). Este documento dice **qué tan confiables son hoy, cómo se miden contra un instrumento y qué falta**. Es el protocolo que pide el
prompt 15 (`docs/referencia/prompts/15_pruebas_y_validacion.md`, feature F21).

> **Estado (2026-11-22): todavía no hay mediciones reales.** Las pruebas automáticas comparan contra una mano simulada que comparte los
> supuestos del cálculo (`src/tracking/sintetica.ts`), así que confirman que el código hace lo que dice, no que la cámara mida bien.
> Ninguna medida debe usarse para decisiones clínicas hasta completar la tabla de §4.

## 1. Cómo se calcula cada medida

| Medida | Cómo se obtiene | Dónde |
|---|---|---|
| **Apertura de pinza (cm)** | Distancia 3D entre la punta del pulgar y la del índice en los puntos de mundo de MediaPipe, por la escala de la calibración. | `src/metrics/geometria.ts` (`aperturaPinza`, `escalaCm`) |
| **Escala** | Con el largo de mano medido con regla (Perfil), escala = largo real / largo del modelo. **Sin regla, se asume la mano promedio del modelo**: los cm son de una «mano promedio», no de la del paciente. | `src/metrics/calibracion.ts` (`resultadoCalibracion`) |
| **Flexión por dedo (°)** | Suma de los ángulos en MCP y PIP de cada dedo. En MCP el segmento anterior es muñeca → nudillo, así que un dedo recto puede leer algunos grados. | `src/metrics/geometria.ts` (`flexionTodos`) |
| **Máximos de la sesión** | El mayor valor **mantenido 120 ms seguidos** (no el de un solo cuadro), para que un salto del seguimiento no fije el récord. | `src/games/shell/medidas.ts` (`MaximoSostenido`) |
| **Suavidad (0–100)** | SPARC (Balasubramanian et al.) de la trayectoria de la muñeca en ventanas de 3 s, llevado a 0–100. La señal ya viene suavizada por el filtro One Euro y en coordenadas de imagen. | `src/metrics/suavidad.ts` |
| **Distancia mano–cámara (cm)** | Modelo de cámara estenopeica con focal supuesta de 0,8 × ancho de imagen. | `src/tracking/distancia.ts` |

## 2. Protocolo

**Materiales:** objetos de 2, 4 y 6 cm de ancho (por ejemplo, tacos de madera o cubos impresos, medidos con pie de metro), regla de 30 cm,
goniómetro de dedos, cinta métrica para la distancia a la cámara, 3 teléfonos distintos (al menos un Android y un iPhone) y una lámpara.

**Preparación de cada persona:**
1. Medir con regla el largo de la mano (pliegue de la muñeca → punta del dedo medio) y guardarlo en **Perfil → Largo de mano**.
2. Hacer la calibración de la app con buena luz.

**Lectura del valor de la app:** abrir la calibración con `?debug=1` al final de la URL (ej. `/sesion/<id>/calibrar?debug=1`). El panel de
depuración muestra en vivo la pinza en cm, el lado de la mano y la confianza. Para la flexión y los máximos de sesión, jugar una sesión corta de
Movilidad guiada y leer el resumen, o exportar el CSV desde el historial (columnas `apertura_max_cm_aprox` y `flexion_indice_max_grados_aprox`).

### 2.1 Apertura de pinza

- Sostener cada objeto (2, 4 y 6 cm) entre las yemas del pulgar y el índice, 2 s quieto.
- A 40, 50 y 60 cm de la cámara (medidos a la palma).
- 10 repeticiones por objeto y distancia: 90 lecturas por persona y teléfono.
- Anotar: valor real (ancho del objeto), valor de la app, distancia, teléfono, luz, mano.

### 2.2 Flexión del índice

- Tres posiciones fijadas con el goniómetro en la articulación MCP + PIP del índice: extendido (≈ 0°), intermedio (≈ 90° sumados) y cerrado.
- 5 repeticiones por posición. Anotar el ángulo del goniómetro y el de la app.

### 2.3 Condiciones

Repetir 2.1 y 2.2 con: **buena luz** (luz de día o lámpara de frente) y **poca luz** (lámpara apagada, solo luz ambiente); **mano derecha e
izquierda**; **3 teléfonos**. Si el tiempo no alcanza, priorizar: un teléfono × dos manos × buena luz completo, y luego una muestra reducida del resto.

### 2.4 Lateralidad

Con una sola mano a la vista, comprobar en el panel de depuración que el lado que informa la app es el correcto, para cada mano y cada teléfono.
**Está sin verificar en teléfono real** (`src/tracking/camara.ts`, opción `invertirLateralidad`); si sale cambiado, todas las cuentas por mano
(agarres izquierda/derecha) están invertidas.

## 3. Cómo calcular el error

Por medida y condición: **error medio** = promedio de (app − real), que muestra si la app sobreestima o subestima; **error absoluto medio** =
promedio de |app − real|; **dispersión** = desviación estándar de (app − real). Una hoja de cálculo basta. La pantalla `/depuracion` debería
hacerlo dentro de la app (pendiente, F21).

Criterio propuesto para decir que una medida es usable como **tendencia** (no como valor clínico): error absoluto medio ≤ 1 cm en apertura y
≤ 10° en flexión, sin sesgo que cambie con la distancia o la luz.

## 4. Resultados

| Medida | Condición | n | Error medio | Error absoluto medio | Dispersión | ¿Confiable? |
|---|---|---|---|---|---|---|
| Apertura de pinza | buena luz, 40–60 cm | — | pendiente | pendiente | pendiente | pendiente de mediciones reales |
| Apertura de pinza | poca luz | — | pendiente | pendiente | pendiente | pendiente de mediciones reales |
| Flexión del índice | buena luz | — | pendiente | pendiente | pendiente | pendiente de mediciones reales |
| Lateralidad | cada teléfono | — | — | — | — | pendiente de mediciones reales |
| Suavidad | — | — | — | — | — | no validada: solo sirve para comparar sesiones de la misma persona |

## 5. Límites conocidos (antes de medir)

- **Sin largo de mano con regla**, los cm son de una mano promedio: para una mano chica la app sobreestima y para una grande subestima.
- La **focal supuesta** (0,8 × ancho) puede no calzar con cámaras en vertical; afecta la distancia estimada, no la apertura (que usa puntos de mundo).
- La **suavidad** se calcula sobre una señal ya filtrada y en ventanas fijas, no por movimiento; su escala 0–100 es propia de la app.
- Las **sesiones jugadas con mano simulada** (`?fuente=sintetica` o `grabacion`) quedan marcadas y no entran en las tendencias.
- Pruebas automáticas de exactitud: `src/tracking/tracking.test.ts`, `src/metrics/metrics.test.ts` y `src/metrics/calibracion.test.ts` (contra la mano simulada).
