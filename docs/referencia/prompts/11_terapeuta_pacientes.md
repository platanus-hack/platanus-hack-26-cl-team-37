# Prompt 11: pacientes del terapeuta

Adjuntar: imagenes/11_terapeuta_pacientes.png

---

Adjunto 11_terapeuta_pacientes.png. Construye /terapeuta/pacientes, visible solo con rol terapeuta.

- Encabezado con el nombre del terapeuta.
- Tres indicadores: pacientes activos, alertas abiertas y adherencia media.
- Lista de pacientes: iniciales, nombre, mano o condición que anotó el terapeuta, semana de tratamiento, minigráfico de su métrica principal y adherencia en porcentaje.
- Alertas en la misma fila: "Dolor N/10 en la última sesión" (cuando supera el umbral del plan) y "Sin sesiones hace N días" (N configurable, 3 por defecto).
- Orden: primero quienes tienen alertas.
- Buscador por nombre.
- Tocar un paciente lleva a /terapeuta/pacientes/:id/plan.
- Barra inferior: Pacientes, Alertas, Planes, Informes. Alertas lista todas las abiertas y permite marcarlas como revisadas; eso también se anota en Auditoria.
- El terapeuta solo ve pacientes que tienen activado "Compartir métricas con mi terapeuta".
