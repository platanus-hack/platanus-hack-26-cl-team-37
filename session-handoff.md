# Traspaso de sesión

Se reescribe completo al final de cada sesión. Es lo primero que lee la sesión siguiente después de `bash init.sh`.

## Dónde quedó (Current Objective)

- Last Updated: 2026-11-22 · coordinación · rama `coord/f17-informes-docs` (copia de trabajo `../lineas/V`, desde `dev` eb52196, después de unir el PR #57).
- Qué trae: F17 terminada (agregar/quitar juegos del plan, exportar informes), documentación de los dos ambientes y de validación, especificación al día. Detalle en `progress.md` (entradas del 2026-11-22) y `docs/equipo/decisiones.md`.
- Recommended Next Step:
  1. Unir el PR de esta rama a `dev` (con `verificar` en verde).
  2. Wiki: alguien con acceso abre https://github.com/platanus-hack/platanus-hack-26-cl-team-37/wiki, toca «Create the first page» y guarda; después se suben las 5 páginas por git (están escritas).
  3. Revisar y aplicar `supabase/migrations/20261122400001_auditoria_acotada.sql` en desarrollo y producción (`docs/equipo/ambientes.md` §3).
  4. Decidir qué hacer con los datos de Carmen en desarrollo (ver «Estado de las verificaciones»).
  5. Pedir a un administrador de la organización que complete la descripción, el enlace (https://manoviva-sigma.vercel.app) y los temas del repositorio.

## Estado de las verificaciones

- `bash init.sh` → INIT OK: 556 unitarias, lint (solo el aviso conocido de `src/ui/piezas.tsx`), build y `verify:db` contra la base de desarrollo.
- e2e corridos con `--workers=1` y en verde: perfil 9/9, prescripcion 8/8, smoke (terapeuta) 9/9, piano 4/4, naranja 4/4, burbujas 4/4, muneca 3/3, torre 4/4, pinza-fina 3/3. **La suite e2e completa no se corrió.**
- 2026-11-22: e2e informes + prescripcion 13/13; `historial.spec.ts` falla porque Carmen tiene 23 sesiones cerradas en desarrollo (4 jugadas a mano por el equipo) y la prueba espera las 19 del seed.
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
