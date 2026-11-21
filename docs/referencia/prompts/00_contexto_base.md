# Prompt 0: contexto base

Adjuntar: imagenes/00_todas_las_vistas.png

---

Actúa como desarrollador principal de ManoViva, una app web móvil de rehabilitación de manos. Hoy el proyecto tiene un juego, "Caja de juguetes" (ruta #/juguetes), con una escena 3D y seguimiento de manos con MediaPipe. Vamos a convertirlo en una app completa para pacientes y terapeutas, medible y trazable.

Antes de escribir código:
1. Lee el repositorio completo: package.json, el enrutador, la escena 3D y el código de MediaPipe. Dime qué framework, librería 3D, motor de física y versión de MediaPipe usa.
2. Mantén ese stack. No migres de framework ni reescribas el juego.
3. Mira la imagen adjunta: es la referencia visual de todas las vistas.

Luego escribe docs/manoviva-spec.md con:

SISTEMA DE DISEÑO
- Tema oscuro. Fondo #0f1720, tarjetas #1a2733, borde rgba(255,255,255,.07), texto #eef3f7, texto secundario #9fb0bf.
- Acento #ffc83d, éxito #4fd1a1, alerta #ff8a5c, información #5ab0ff.
- Títulos en Poppins 700, texto en DM Sans. Radios de 14 a 18 px. Botón principal de 52 px de alto, fijo abajo.
- Los pacientes pueden tener poca destreza en las manos: zonas táctiles de 48 px o más, texto de 14 px o más, nada que exija gestos finos.
- Todo en español de Chile, decimales con coma.

RUTAS
/acceso, /inicio, /ejercicios, /sesion/:juego/preparar, /sesion/:id/calibrar, /sesion/:id/jugar, /sesion/:id/sensacion, /sesion/:id/resumen, /progreso, /historial, /historial/:id, /terapeuta/pacientes, /terapeuta/pacientes/:id/plan, /privacidad.

MODELO DE DATOS
- Usuario: id, rol (paciente | terapeuta), nombre, clinicaId.
- Paciente: id, usuarioId, terapeutaId, manoAfectada, fechaInicio, largoManoCm.
- Plan: id, pacienteId, version, vigenteDesde, creadoPor, sesionesPorSemana, umbralDolor, mensaje, items [juego, nivel, duracionMin, mano, metaAgarres, metaPinzaCm].
- Sesion: id legible (S-AAAAMMDD-NN), pacienteId, planVersion, juego, parametros, inicio, fin, estado (preparada | en curso | cerrada), calibracion, metricas, dolorEVA, esfuerzo, nota, dispositivo, versionApp, versionModelo, hash.
- EventoSesion: sesionId, t, tipo (agarre_inicio | agarre_fin | soltar | perdida_seguimiento | pausa), mano, objeto, datos.
- Auditoria: id, quien, cuando, accion, entidad, antes, despues. Solo se agregan registros, nunca se editan.
- Consentimiento: pacienteId, version, firmadoEl, opciones.

REGLAS
- El video de la cámara nunca se guarda ni se envía. Solo se guardan puntos de la mano, eventos y métricas.
- Una sesión cerrada es inmutable. Cualquier corrección es un registro nuevo en Auditoria.
- El acceso a datos va detrás de una interfaz (repositorios). Primera implementación local con IndexedDB, para que la app funcione sin servidor. Deja lista la interfaz para conectar después un backend con autenticación y permisos por rol.
- Cada pantalla tiene estados de carga, vacío y error.
- Las fórmulas de métricas viven en funciones puras con pruebas unitarias.

No construyas pantallas todavía. Al terminar, muéstrame el spec, la estructura de carpetas que propones y tus dudas.
