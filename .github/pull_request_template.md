## Qué cambia
<!-- Una o dos frases. Funcionalidad (F__) o juego si corresponde. -->

## Rol y carpetas tocadas
- [ ] P1 · P2 · P3 (marca el tuyo)
- [ ] Solo toqué carpetas propias (o avisé al dueño: ver `docs/equipo/contratos.md` §7)
- [ ] Si toqué un archivo compartido (registry, modulos, Miniatura, sintetica, repos, piezas): solo agregué, no cambié lo existente

## Verificación
- [ ] `npm run verify` en verde (tipos, lint, unitarias, build)
- [ ] e2e de mi área en verde (si usan el paciente de prueba: candado de `flujo-git-ci.md` §6)
- [ ] Vista nueva o cambiada: captura adjunta (`npm run captura -- <ruta> <nombre>`)
- [ ] Juego nuevo: lista de `contratos.md` §1.3 completa y probado con mano derecha e izquierda

## Base de datos
- [ ] No hay migración, o es aditiva, con numeración de mi rol (`contratos.md` §3) y ya la aplicaron/aplicaré con `supabase db push --include-all`
- [ ] No usé `db:seed` ni creé datos en pacientes demo desde pruebas

## Invariantes
- [ ] No guardo ni envío video; no aparecen las palabras "fuerza" ni "presión"; medidas de cámara con "aprox."
- [ ] No hay claves ni `.env*` en el diff

## Riesgos / qué mirar al revisar
