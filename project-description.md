# Kuwü

**Rehabilitación de manos que se juega.** El paciente hace sus ejercicios jugando frente a la cámara del teléfono y su terapeuta ve cómo avanza, sin esperar al próximo control.

## El problema

Después de una lesión, una cirugía o un accidente cerebrovascular, recuperar la mano depende de repetir ejercicios en casa durante semanas. Hoy esos ejercicios se entregan en una hoja impresa: el paciente no sabe si los hace bien, se aburre y deja de hacerlos, y el terapeuta solo se entera en el control siguiente.

## Qué hace Kuwü

- **La mano es el control.** La cámara frontal del teléfono sigue 21 puntos de la mano en tiempo real. No hace falta guante, sensor ni ningún equipo aparte.
- **Diez juegos, cada uno para un gesto.** Caja de juguetes (pinza y agarre), Movilidad guiada (abrir y cerrar), Torre de cubos (precisión y control), Pinza fina (oposición del pulgar), Atrapa burbujas (alcance y extensión), Exprime la naranja (cierre de puño), Memoria de cartas (giro del antebrazo), Piano de dedos (independencia de dedos), Banda elástica (estirar una banda con ambas manos) y Muñeca 3D (flexión y desviación de la muñeca). Cada juego tiene cinco niveles.
- **Cada sesión deja medidas.** Repeticiones, precisión, apertura, rango por dedo y suavidad del movimiento, siempre mostradas como estimaciones de cámara. Al terminar, el paciente registra cómo se sintió y cuánto le dolió.
- **El terapeuta ve el avance a distancia.** Tiene la lista de sus pacientes, las alertas (por ejemplo, dolor alto o varios días sin ejercitar) y el historial de cada uno.
- **Registro que se puede verificar.** Una sesión cerrada no se puede modificar y lleva un sello (hash) que permite comprobar que nadie la alteró.

## Privacidad

El seguimiento de la mano corre en el navegador del teléfono. **El video nunca se guarda ni se envía**: solo salen puntos, eventos y métricas. El paciente puede descargar sus datos o eliminarlos.

## Por qué es Physical World

La entrada es una señal física real, el movimiento de la mano captado por la cámara, y lo que se mide es ese movimiento. Es solo software: funciona en un teléfono común, sin dispositivo propio.

## Pruébalo

Abre https://manoviva-sigma.vercel.app en un teléfono, elige «Soy paciente» o «Soy terapeuta» y toca **Entrar con cuenta demo**. Los datos de esa cuenta son ficticios y la app lo indica; las sesiones que juegues con tu mano sí se miden de verdad.

Kuwü no entrega diagnósticos ni reemplaza al terapeuta: lo complementa.

## Cómo está hecho

React y TypeScript, three.js y Rapier para los juegos 3D, MediaPipe para el seguimiento de la mano y Supabase para los datos, con permisos por fila. Es una aplicación web instalable que sigue funcionando sin conexión y sincroniza después.
