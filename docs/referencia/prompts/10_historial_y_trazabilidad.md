# Prompt 10: historial y trazabilidad

Adjuntar: imagenes/10a_historial.png, imagenes/10b_registro_sesion.png

---

Adjunto 10a_historial.png y 10b_registro_sesion.png. Construye /historial y /historial/:id.

LISTA
- Orden cronológico, lo más reciente primero. Mezcla sesiones y cambios de plan.
- Cada fila: fecha, ejercicio, hora, ID de sesión y etiquetas (agarres/meta, precisión, dolor). Los cambios de plan muestran quién los hizo y qué cambió.
- Contador de sesiones registradas.

REGISTRO DE SESIÓN (hoja inferior al tocar una fila)
- ID, fecha y hora, ejercicio, parámetros usados, quién prescribió, dispositivo y fps de cámara, versión de la app y del modelo de MediaPipe.
- Integridad: recalcula el hash SHA-256 y compáralo con el guardado. Muestra "Verificado" o "Alterado".

EXPORTAR
- PDF de una sesión o de un período: paciente, terapeuta, fechas, tabla de métricas, gráficos de progreso, dolor reportado, IDs y hashes de las sesiones incluidas. Al pie: "Mediciones estimadas con cámara; no reemplazan la evaluación clínica".
- CSV: un archivo con una fila por sesión y otro con los eventos.
- Cada exportación queda anotada en Auditoria (quién, cuándo, qué).

AUDITORIA
- Confirma que es de solo agregar: no existe en el código ninguna función que edite o borre registros de Auditoria ni sesiones cerradas. Agrega una prueba que lo verifique.
