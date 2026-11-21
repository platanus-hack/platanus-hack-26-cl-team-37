# Prompt 12: prescripción del plan

Adjuntar: imagenes/12_prescripcion.png

---

Adjunto 12_prescripcion.png. Construye /terapeuta/pacientes/:id/plan.

- Encabezado con el paciente y su semana de tratamiento.
- Tarjeta de tendencia: apertura de pinza en las últimas 4 semanas.
- Plan semanal con controles de menos y más:
  - Nivel de dificultad por juego (1 a 5).
  - Sesiones por semana.
  - Meta de pinza en cm, en pasos de 0,5.
  - Aviso por dolor: alertar si la EVA es igual o mayor a N.
- Los valores modificados se destacan en amarillo hasta enviar.
- Mensaje opcional para el paciente.
- "Enviar plan" muestra un resumen de los cambios para confirmar. Al confirmar crea una versión NUEVA del Plan (nunca edita la anterior), escribe en Auditoria el antes y el después, y avisa "Plan actualizado".
- El paciente ve el plan nuevo y el mensaje en /inicio, y el cambio aparece en su /historial.
- Las sesiones antiguas siguen apuntando a la versión del plan con que se hicieron.
