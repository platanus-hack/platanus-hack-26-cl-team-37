# Plan de hoy

## 1. Hitos (rellenar la hora de entrega: **D = __:__**)

| Cuándo | Qué pasa | Quién decide |
|---|---|---|
| Ahora | Cada persona clona, corre `bash init.sh` y empieza su lista P0 | cada uno |
| **D − 3 h** | **Congela juegos nuevos.** Un juego que no esté en `main` con su e2e en verde queda como "Próximamente" | P3 + coordinación |
| **D − 2 h** | **Congela funcionalidades.** Desde aquí solo se aceptan correcciones de errores | coordinación |
| **D − 1 h** | Regresión completa sobre producción (§2) con teléfono real. Se anotan fallas; solo se arreglan las que rompen la demo | P1 ejecuta, P2 confirma lo de cámara |
| **D − 30 min** | Deploy final, `npm run db:seed` (una sola vez, reinicia los datos de demo), ficha de entrega completa | coordinación |
| **D − 15 min** | Nadie empuja nada. Solo se mira la demo | todos |

Si algo no llega a su hito, **se recorta**, no se corre. La demo vale más con 3 juegos que andan que con 6 a medias.

## 2. Camino de la demo (esto tiene que funcionar en producción, en teléfono)

| # | Paso | Ruta | Verifica |
|---|---|---|---|
| 1 | Entrar como paciente con "Entrar con cuenta demo" | `/acceso` | P1 |
| 2 | Ver plan de hoy, racha y adherencia | `/inicio` | P1 |
| 3 | Elegir Caja de juguetes y "Comenzar" | `/ejercicios` → `/sesion/…/preparar` | P1 |
| 4 | Calibrar con la cámara | `/sesion/…/calibrar` | P2 |
| 5 | **Jugar: tomar y dejar juguetes en la caja** | `/sesion/…/jugar` | P2 |
| 6 | Dolor y esfuerzo → resumen con métricas | `/sensacion` → `/resumen` | P2 |
| 7 | Progreso e historial (hash "Verificado"; exportar PDF) | `/progreso`, `/historial` | P1 |
| 8 | Un segundo juego (Pinza fina; y los de P3 si llegan) | `/ejercicios` | P3 |
| 9 | Entrar como terapeuta: pacientes, alertas (Luis con dolor 6/10) | `/terapeuta/pacientes` | P1 |
| 10 | **Prescribir un plan nuevo** y ver que el paciente lo recibe | `/terapeuta/pacientes/:id/plan` | P2 |
| 11 | Privacidad: "tu video no se guarda", consentimiento | `/privacidad` | P1 |

Los pasos 5 y 10 son los que más impresionan y los que hoy están más cerca de romperse: tienen prioridad.

## 3. Punto de partida (resumen de `session-handoff.md`)

- **Hecho en `main`:** acceso, inicio, ejercicios, preparar, calibración, base de juegos en three.js, Caja de juguetes,
  Movilidad guiada, Pinza fina, dolor y esfuerzo, resumen con hash, progreso, historial con exportación,
  panel y alertas del terapeuta, privacidad con consentimiento, app instalable sin conexión.
- **A medias (ramas en el repositorio):** `linea-G` prescripción, `linea-H` perfil, `linea-I` Torre de cubos, `linea-J` Atrapa burbujas.
  Las migraciones de G y H **ya están aplicadas** en la base y copiadas en `main`.
- **Nunca probado con cámara real en teléfono:** lateralidad izquierda/derecha, tamaño y altura de la mano virtual
  (en Pinza fina se ve más chica y baja que la referencia), umbrales de pinza, fps. La profundidad ya se corrigió tras una prueba en computador.

## 4. P1 · Plataforma y calidad

Reglas propias: no cambia comportamiento de pantallas ajenas; los cambios en `src/ui/piezas.tsx` son compatibles hacia atrás;
no renombra textos ni roles que usan las pruebas e2e sin actualizar las pruebas (`grep` en `e2e/` antes de cambiar un texto).

**P0 (primeras 2 horas, en este orden)**
1. **CI mínima** (`.github/workflows/ci.yml`): tipos, lint, unitarias y build en cada PR y en `main`. *Terminado cuando:* un PR de prueba muestra los checks y `main` exige que pasen.
2. **e2e en CI** contra la base compartida, serializada (spec en `flujo-git-ci.md` §3). *Terminado cuando:* `npx playwright test --workers=2` pasa en Actions y dos PR a la vez no se pisan.
3. **Deploy automático a Vercel** al unir a `main`, con prueba de humo (§4 de `flujo-git-ci.md`). *Terminado cuando:* un merge de prueba cambia el sitio y la prueba de humo falla si `/` no responde 200 o falta el header de seguridad.
4. **Vista ancha para el terapeuta** (≥ 900 px: dos columnas en pacientes, planes y prescripción; el paciente sigue en columna). Hoy la app en computador es un teléfono de 520 px de ancho en medio de la pantalla. *Terminado cuando:* captura 1280×800 de `/terapeuta/pacientes` se ve intencional y las e2e de terapeuta siguen en verde.
5. **Casos borde de la demo** (cada uno con prueba o con checklist manual escrito en `docs/equipo/registro-P1.md`):
   cámara denegada / ocupada / inexistente; red cortada con mensaje claro (hoy una lista sin red muestra "0 sesiones" sin avisar);
   doble toque en "Comenzar" (no crear dos sesiones); sesión expirada → vuelve a `/acceso` con aviso; paciente sin consentimiento, sin plan o sin terapeuta.

**P1 (si P0 está listo)**
6. Pulido visual contra `docs/referencia/imagenes/` (capturas lado a lado con `npm run captura`), contraste, foco visible, zonas táctiles ≥ 48 px, esqueletos de carga.
7. iPhone/Safari: Wake Lock, orientación, `playsinline`, barra de direcciones en el HUD horizontal.

**P2 (solo si sobra tiempo)**: actualización del service worker tras un deploy (que no sirva la versión vieja), husos horarios de Chile en racha y semana, límite de inicios de sesión de Supabase.

## 5. P2 · Juegos existentes y funcionalidades

Dueño de `src/games/shell/`, `src/games/caja|movilidad|pinza/`, `src/tracking/`, `src/metrics/`, `src/screens/terapeuta/`.

**P0**
1. **Prueba con teléfono real** sobre la URL de producción (Android Chrome; iPhone si hay): ¿acercar la mano la mete al fondo? ¿izquierda y derecha correctas?
   ¿tamaño y altura de la mano virtual razonables? ¿agarre natural? ¿fps ≥ 24? Anotar el resultado en `docs/equipo/registro-P2.md` y corregir (`ZONA_BASE`, umbrales de pinza, escala).
2. **Terminar prescripción (F17)** desde la rama `linea-G`: `git fetch && git checkout -b p2/prescripcion origin/linea-G` y rebase sobre `main`.
   *Terminado cuando:* el terapeuta cambia nivel, sesiones por semana, meta de pinza y aviso por dolor, confirma el resumen de cambios, y el paciente ve el plan y el mensaje en `/inicio` y el cambio en `/historial`.
   No crear versiones de plan en los 4 pacientes de demostración desde las pruebas (ver `contratos.md` §5).
3. **Terminar perfil (F19)** desde `linea-H` (largo de mano con regla, enlace a privacidad, cerrar sesión).

**P1**
4. Sensación de juego de Caja y Movilidad en teléfono; e2e de Pinza fina con mano izquierda (hoy sin cubrir).
5. **Diagnóstico mínimo (recorte de F21):** `/depuracion` con fps, distancia estimada, lateralidad detectada y grabador de landmarks, para diagnosticar en un teléfono. Más `docs/validacion.md` con el protocolo (sin ejecutarlo hoy).

**P2**: mensajes y robustez de la calibración (poca luz, mano fuera de cuadro).

## 6. P3 · Juegos nuevos

Cada juego vive en `src/games/<id>/` y sigue el contrato de juego (`contratos.md` §1). Un juego por vez, un PR por juego.

**P0**
1. **Torre de cubos (F22)** desde `linea-I`: `git checkout -b p3/torre-cubos origin/linea-I` y rebase sobre `main`. Ojo con la convención de profundidad (cerca de la cámara = fondo de la mesa).
2. **Atrapa burbujas (F24)** desde `linea-J`.

**P1**: 3. **Exprime la naranja (F25)**, sin física; cierre de puño en %, sin palabras "fuerza" ni "presión".
**P2**: 4. **Piano de dedos (F27)** (WebAudio) y 5. **Memoria de cartas (F26)** (el giro del antebrazo es la medida más ruidosa: mostrar los grados como "aprox., no validado").

**Regla de entrega por juego:** pasa a `disponible: true` solo con la lista de verificación de `contratos.md` §1.3 completa,
probado con la fuente simulada con **mano derecha y mano izquierda**, y visto una vez en un teléfono. Si a D − 3 h no cumple, queda "Próximamente".

## 7. Coordinación

Ficha de entrega (`platanus-hack-project.jsonc`, `project-description.md`), presentación del impacto y la solución,
revisión de PR que toquen archivos compartidos, resolver dudas de contratos, regresión final y `db:seed` a D − 30 min.

## 8. Fuera de alcance hoy

Validación con regla y goniómetro (protocolo escrito, no ejecutado), publicación en tiendas (Capacitor), backend de autenticación
propio, texto legal real del consentimiento, desactivar el registro público de Supabase Auth (anotado como riesgo).

## 9. Si algo se rompe en `main`

1. Quien lo ve avisa en el chat del equipo con el commit sospechoso.
2. **Primero se revierte** el PR (`git revert`, PR rápido); después se investiga.
3. Si es producción y no hay quien revierta: coordinación redespliega el último commit bueno (`vercel rollback` o redeploy desde ese commit).
