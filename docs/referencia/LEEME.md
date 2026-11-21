# ManoViva — Prompts para construir la app

Este paquete trae 16 prompts para construir la app y 7 prompts para agregar juegos nuevos. Se pegan, uno a la vez, en un asistente de programación con acceso a tu repositorio de ManoViva (Claude Code u otro).

## Cómo usarlos

1. Abre el asistente en la carpeta del proyecto que hoy corre en `localhost:5174`.
2. Pega el Prompt 0. Deja que lea el código y escriba `docs/manoviva-spec.md`; todos los prompts siguientes se apoyan en ese archivo.
3. Sigue en orden. En cada prompt adjunta la imagen indicada.
4. Después de cada prompt, prueba en un teléfono real antes de seguir. La cámara solo funciona con HTTPS o en `localhost`.
5. Si el resultado no calza con la imagen, dilo en concreto: "el botón debe ir fijo abajo", "falta la fila de dolor".

Cada archivo de prompt tiene un encabezado con el título y la imagen a adjuntar. Lo que se copia es el texto que está bajo la línea.

## Prompts de la app (carpeta `prompts/`)

| Archivo | Vista | Imagen a adjuntar |
| --- | --- | --- |
| 00_contexto_base.md | Contexto base del proyecto | imagenes/00_todas_las_vistas.png |
| 01_acceso.md | Acceso y roles | imagenes/01_acceso.png |
| 02_inicio_paciente.md | Inicio del paciente | imagenes/02_inicio_paciente.png |
| 03_ejercicios.md | Catálogo de ejercicios | imagenes/03_ejercicios.png |
| 04_preparar_sesion.md | Preparar la sesión | imagenes/04_preparar_sesion.png |
| 05_calibracion.md | Calibración con MediaPipe | imagenes/05_calibracion.png |
| 06_juego_con_metricas.md | Juego con métricas en vivo | imagenes/06a_juego_agarre.png, imagenes/06b_juego_meta_cumplida.png |
| 07_dolor_y_esfuerzo.md | Dolor y esfuerzo | imagenes/07_dolor_y_esfuerzo.png |
| 08_resumen_sesion.md | Resumen de sesión | imagenes/08_resumen_sesion.png |
| 09_progreso.md | Progreso | imagenes/09_progreso.png |
| 10_historial_y_trazabilidad.md | Historial y trazabilidad | imagenes/10a_historial.png, imagenes/10b_registro_sesion.png |
| 11_terapeuta_pacientes.md | Pacientes del terapeuta | imagenes/11_terapeuta_pacientes.png |
| 12_prescripcion.md | Prescripción del plan | imagenes/12_prescripcion.png |
| 13_privacidad.md | Privacidad y datos | imagenes/13_privacidad.png |
| 14_empaquetar_para_celular.md | Empaquetar para celular | sin imagen |
| 15_pruebas_y_validacion.md | Pruebas y validación | sin imagen |

## Prompts de juegos nuevos (carpeta `prompts_juegos/`)

Úsalos después de terminar los prompts 0 a 9. Empieza por J0: deja lista la base común para que cada juego nuevo se enchufe sin repetir código.

| Archivo | Juego | Gesto que trabaja | Imagen a adjuntar |
| --- | --- | --- | --- |
| J0_base_comun_de_juegos.md | Base común | — | imagenes_juegos/00_seis_juegos_nuevos.png |
| J1_torre_de_cubos.md | Torre de cubos | Pinza y precisión | imagenes_juegos/01_torre_de_cubos.png |
| J2_pinza_fina.md | Pinza fina | Oposición del pulgar | imagenes_juegos/02_pinza_fina.png |
| J3_atrapa_burbujas.md | Atrapa burbujas | Alcance y extensión de dedos | imagenes_juegos/03_atrapa_burbujas.png |
| J4_exprime_la_naranja.md | Exprime la naranja | Cierre de puño | imagenes_juegos/04_exprime_la_naranja.png |
| J5_memoria_de_cartas.md | Memoria de cartas | Giro del antebrazo | imagenes_juegos/05_memoria_de_cartas.png |
| J6_piano_de_dedos.md | Piano de dedos | Independencia de dedos | imagenes_juegos/06_piano_de_dedos.png |

## Límites que conviene tener presentes

- Las medidas en centímetros y grados son estimaciones hechas con una sola cámara. Hasta completar el protocolo del Prompt 15, trátalas como tendencias y no como mediciones clínicas.
- La cámara no mide fuerza. Ningún juego debe mostrar algo que lo sugiera.
- Los prompts dejan la app funcionando con datos locales. Antes de usarla con pacientes reales falta un backend con autenticación, permisos por rol y cifrado, y una revisión legal del manejo de datos de salud.
- La relación entre cada juego y el gesto que trabaja es una propuesta; conviene que un terapeuta la revise antes de asignar los juegos a pacientes.
- Los nombres, códigos y cifras de las imágenes son de ejemplo.

Fuente de la configuración de MediaPipe usada en los prompts: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
