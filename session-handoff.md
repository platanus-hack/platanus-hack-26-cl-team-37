# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `bash init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-22 · coordinación · rama `coord/arreglos-evaluacion` (copia de trabajo `../lineas/V`, creada desde `dev` e105f44). **Sin subir al remoto y sin Pull Request**: falta que el dueño lo autorice.
- Qué trae la rama: arreglos tras una evaluación independiente de `dev`. Resumen en `progress.md` (entrada del 2026-11-22) y cada decisión en `docs/equipo/decisiones.md`.
  - F19 Perfil: **done**. F17 Prescripción: **in-progress** (la pantalla funciona; falta exportar informes y agregar o quitar juegos del plan).
  - Juegos: meta de Piano por aciertos, pérdida de seguimiento sin castigo, estados con tiempo límite.
  - Medidas: máximos sostenidos, sesiones simuladas fuera de las tendencias.
  - Datos: cola sin conexión que no se frena ni mezcla cuentas.
  - Interfaz: límite de errores, foco en ventanas modales, errores legibles.
- Recommended Next Step:
  1. El dueño revisa la rama y autoriza `git push -u origin coord/arreglos-evaluacion` y el PR a `dev` (antes: `git fetch origin && git merge origin/dev` y `npm run verify`).
  2. Revisar y aplicar la migración `supabase/migrations/20261122400001_auditoria_acotada.sql` en desarrollo y en producción (`supabase db push --include-all`); después sumar su caso a `scripts/verificar-rls.ts`.
  3. Avisar a P1 (datos, `src/ui/piezas.tsx`), P2 (shell de juegos, métricas, terapeuta, F17 y F19) y P3 (Piano, Torre, Burbujas, Naranja) de lo que cambió en su área.

## Estado de las verificaciones

- `bash init.sh` → INIT OK: 556 unitarias, lint (solo el aviso conocido de `src/ui/piezas.tsx`), build y `verify:db` contra la base de desarrollo.
- e2e corridos con `--workers=1` y en verde: perfil 9/9, prescripcion 8/8, smoke (terapeuta) 9/9, piano 4/4, naranja 4/4, burbujas 4/4, muneca 3/3, torre 4/4, pinza-fina 3/3. **La suite e2e completa no se corrió.**
- `e2e/terapeuta.spec.ts` falla hoy en el orden de la lista por una alerta de dolor abierta de Carmen en la base de desarrollo (sesión `S-20261121-60`, anterior a este trabajo). Revisarla o marcarla y volver a correr.
- `e2e/caja.spec.ts` «cuenta agarres exactos» es inestable desde antes: en una comparación alternada pasó 2 de 4 con el código nuevo y 2 de 4 con el anterior, con el mismo fallo en ambos («2/3» esperado, «1/3» recibido).

## Archivos clave (Files)

- Cola sin conexión: `src/data/colaLocal.ts` (tabla local `descartados`, dueño por ítem), `src/data/sinConexion.ts`, pruebas en `src/data/sinConexion.test.ts`.
- Medidas: `src/games/shell/medidas.ts` (`MaximoSostenido`), `src/metrics/sesion.ts` (`esSimulada`, `contarAgarres`), `src/metrics/agarre.ts` (`pasoAgarreTolerante`).
- Interfaz común: `src/ui/Limite.tsx`, `src/lib/errores.ts`, `Hoja`/`Dialogo`/`avisar` en `src/ui/piezas.tsx`.
- Pantallas nuevas: `src/screens/paciente/Perfil.tsx` (+ `largoMano.ts`, `perfil.css`), `src/screens/terapeuta/Prescripcion.tsx` (+ `edicionPlan.ts`, `prescripcion.css`).
- Ayudantes de prueba: `scripts/prueba-plan.ts`, `scripts/prueba-largo-mano.ts`, `scripts/bloqueo-prueba.ts` (candado para los e2e que cambian al paciente de prueba).
- Contrato de juegos: `src/games/shell/contrato.ts` (nuevo `HudJuego.terminado`, opcional) y `ciclo.ts` (entrada `agotado`).

## Cuidado con

- `bash init.sh` corre `npm install` y en Windows reescribe `package-lock.json`: antes de hacer commit, `git checkout -- package-lock.json` (la CI usa `npm ci` y falla con el archivo reescrito).
- Puertos: hay servidores de desarrollo viejos de otras líneas en 5192 y 5194 que apuntan a la base de **producción**. Playwright y `npm run captura` reutilizan lo que esté escuchando: usar otros puertos (`E2E_PUERTO`, `CAPTURA_PUERTO`) o cerrar esos procesos.
- `manoviva/.env.local` (la copia principal, en `master`) apunta a producción; las líneas recientes (`../lineas/R` en adelante) apuntan a desarrollo.
- Los archivos del repositorio mezclan finales de línea LF y CRLF: editar conservando el de cada archivo (un cambio de finales reescribe el archivo entero en el diff).
- Carmen (cuenta demo) tiene en desarrollo sesiones recientes jugadas con cámara real por el equipo (apertura 9 a 11 cm): por eso su tendencia salta al final. No son simuladas.

## Bloqueos (Blockers) — pendiente de humano, no frena el avance

- Probar en teléfono real: lateralidad izquierda/derecha, PWA instalada, modo avión, rendimiento, juegos nuevos con cámara.
- Medir con regla y goniómetro (F21): hoy la exactitud solo está probada contra la mano simulada.
- Texto legal real del consentimiento (`src/legal/consentimiento-v1.md` es provisorio).
- Desactivar el registro público de Supabase Auth antes de uso real.

## Queda a decisión del equipo (no se tocó)

- Las e2e no corren solas en la CI y el deploy a desarrollo no espera a `verificar`.
- El amarillo como única señal de «hecho» (arco de la semana, niveles, barras) tiene contraste muy bajo sobre crema.
- La PWA precarga 29,8 MB (modelo de manos, wasm de MediaPipe y Rapier).
- Rutas `/depuracion`, `/primitivas` y `/oficina-3d` publicadas en producción.

## Próxima sesión (Next Session)

1. `bash init.sh` → INIT OK (y restaurar `package-lock.json`).
2. Con la autorización del dueño: subir la rama y abrir el PR a `dev`.
3. Seguir con F17 (informes y edición de la lista de juegos), F21 y F28/F32 (cierre y presentación).
