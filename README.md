# Kuwü

<img src="./project-logo.png" alt="Logo de Kuwü" width="160" />

**Rehabilitación de manos que se juega.** El paciente hace sus ejercicios jugando frente a la cámara del teléfono, la app mide cada movimiento y el terapeuta ve el avance a distancia.

- **Pruébalo:** https://manoviva-sigma.vercel.app (en un teléfono, con «Entrar con cuenta demo»).
- **Track:** 🌎 Physical World · Platanus Hack 26: Santiago ft. Buk · team-37.

## Qué hace

- **La mano es el control.** MediaPipe sigue 21 puntos de la mano con la cámara frontal, en el navegador. Sin guantes ni sensores.
- **Diez juegos 3D**: pinza y agarre, abrir y cerrar, precisión, oposición del pulgar, alcance, cierre de puño, giro del antebrazo, independencia de dedos, estirar una banda con ambas manos y movilidad de la muñeca.
- **Cada sesión deja medidas** (repeticiones, precisión, apertura, rango por dedo, suavidad), siempre como estimaciones de cámara.
- **Vista del terapeuta:** pacientes, alertas, historial de cada uno y prescripción del plan (cada cambio crea una versión nueva).
- **Privacidad:** el video no se guarda ni se envía; solo puntos, eventos y métricas.
- **Registro verificable:** una sesión cerrada es inmutable en la base de datos y lleva un hash SHA-256 de su contenido, que permite detectar si cambió después.

La cuenta demo trae datos ficticios (la app lo indica). Kuwü no entrega diagnósticos ni reemplaza al terapeuta.

## Stack

React 19 · TypeScript · Vite · three.js · Rapier · MediaPipe Hand Landmarker · Supabase (Postgres con permisos por fila) · PWA con cola sin conexión · Vitest y Playwright · despliegue en Vercel desde GitHub Actions.

## Correrlo en local

```bash
npm install
cp .env.example .env.local   # completa las claves de Supabase
npm run dev                  # http://localhost:5174
npm run verify               # tipos, lint, pruebas unitarias y build
```

La cámara solo funciona con HTTPS o en `localhost`; para probar en un teléfono, ver `docs/telefono.md`.

## Dónde está cada cosa

| Carpeta | Contenido |
|---|---|
| `src/tracking/` | Cámara, MediaPipe y filtros de la señal de la mano |
| `src/games/` | Un juego por carpeta (`juego.ts`, `logica.ts`, `modulo.ts`) y la base común en `shell/` |
| `src/metrics/` | Cálculo de las medidas de cada sesión |
| `src/screens/` | Pantallas del paciente y del terapeuta |
| `supabase/migrations/` | Esquema, permisos por fila e inmutabilidad |
| `e2e/` | Pruebas de punta a punta |
| `docs/` | Especificación (`manoviva-spec.md`) y acuerdos del equipo (`equipo/`) |

## Documentación

La [wiki](https://github.com/platanus-hack/platanus-hack-26-cl-team-37/wiki) es la entrada rápida: qué es, cómo está hecho y por dónde empezar.
El detalle vive en el repositorio, junto al código:

| Documento | Para qué |
|---|---|
| [`docs/manoviva-spec.md`](docs/manoviva-spec.md) | Especificación técnica: stack, rutas, modelo de datos, contrato de juegos, distancia |
| [`docs/equipo/ambientes.md`](docs/equipo/ambientes.md) | Desarrollo y producción: qué base usa cada cosa y cómo cambiar de ambiente |
| [`docs/equipo/README.md`](docs/equipo/README.md) | Cómo trabaja el equipo; de ahí salen contratos, flujo de Git y CI, y decisiones |
| [`docs/validacion.md`](docs/validacion.md) | Qué tan confiables son las medidas y cómo validarlas con regla y goniómetro |
| [`docs/privacidad-red.md`](docs/privacidad-red.md) | Qué sale del dispositivo y la política de seguridad del sitio |
| [`docs/telefono.md`](docs/telefono.md) | Probar en un teléfono real |
| [`brandbook/README.md`](brandbook/README.md) | Colores, tipografía y controles de la interfaz |
| [`src/games/assets/README.md`](src/games/assets/README.md) | Modelos 3D compartidos de los juegos |

## Equipo

- Andrés Cabezas ([@ElTioAndresCabezas](https://github.com/ElTioAndresCabezas))
- Felipe Ignacio Jara Cáceres ([@felipeuc2020](https://github.com/felipeuc2020))
- Martin Campos ([@martincamposdonoso2000](https://github.com/martincamposdonoso2000))
- Andres Augusto Schmidt Calvo ([@elmiich](https://github.com/elmiich))
- Maximiliano Aguirre ([@Cadutodalcielo](https://github.com/Cadutodalcielo))
