# Assets de los juegos

Modelos 3D, texturas y colores de las escenas, hechos con código three.js (no hay archivos .glb). Los juegos (`src/games/<juego>/modulo.ts`) solo los crean, los ubican y los animan.

**Cómo se usan:** cada fábrica recibe `recursos` (`recursos.ts`: los arreglos de materiales, geometrías y texturas del juego) y registra ahí lo que crea, para que el juego lo libere al desmontar. Devuelven el objeto **sin agregarlo a la escena**.

## Compartidos

| Archivo | Qué tiene |
|---|---|
| `colores.ts` | Colores de las escenas, todos de la paleta del brandbook (`colores.test.ts` impide colores a mano en el resto de `src/games`). |
| `naturales.ts` | La excepción: colores reales de madera, fruta, jugo, vidrio (`NATURAL`) y bandas elásticas (`BANDAS`). Sin three.js, para la lógica pura. |
| `recursos.ts` | Tipo `Recursos` y ayudantes `material`, `geometria`, `textura`, `estandar`, `liberar`. |
| `texturas.ts` | `texturaHalo`, `texturaAnillo`, `texturaMadera`, `texturaDeLienzo`. |
| `sprites.ts` | `crearSprite` (halos, anillos, brillos, "+1"). |
| `formas.ts` | `crearAnilloPlano`, `crearDisco` (zonas y halos sobre la mesa). |
| `mano.ts` | `ModeloMano` con `ESTILO_JUGADOR` (la mano del paciente) y `estiloGuia` (la mano guía de Movilidad). |
| `mesa.ts` | `crearMesa` (tablero de madera común a todos los juegos). |
| `piezas.ts` | `crearPiezaFisica` (malla + cuerpo Rapier: juguetes de Caja, cubos de Torre). |

## De cada juego

| Carpeta | Qué tiene |
|---|---|
| `caja/` | Caja de madera con sus colisionadores. |
| `torre/` | Base de madera y silueta del cubo siguiente. |
| `naranja/` | Naranja, vaso con jugo, fuente, mitades y gotas. |
| `memoria/` | Figuras, texturas de cara y reverso, y las cartas. |
| `burbujas/` | Burbujas de adorno y objetivo, efecto de reventar. |
| `piano/` | Teclas, línea de toque y notas. |
| `movilidad/` | Cuentas del arco de progreso. |

Pinza fina solo usa lo compartido. Los HUD dibujados en lienzo y fijos a la cámara (luces de Pinza, tarjeta de Naranja, aviso de Piano, rótulos de Movilidad) se quedan en cada juego: se redibujan con su estado.
