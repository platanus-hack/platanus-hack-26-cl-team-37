# Prompt 2: inicio del paciente

Adjuntar: imagenes/02_inicio_paciente.png

---

Adjunto 02_inicio_paciente.png. Construye /inicio.

- Saludo con nombre y fecha de hoy.
- Tarjeta "Plan de hoy" con anillo de progreso (ejercicios hechos / total) y quién indicó el plan.
- Lista de ejercicios del día con tres estados: Hecho, Siguiente (destacado) y Pendiente. Tocar "Siguiente" lleva a /sesion/:juego/preparar.
- Racha en días y adherencia de la semana. Adherencia = sesiones hechas / sesiones planificadas en los últimos 7 días. Ponla en una función con pruebas.
- Tira de la semana (L a D) con días cumplidos, parciales y pendientes.
- Tarjeta de próxima cita con el terapeuta, si existe.
- Si hay un mensaje nuevo del terapeuta en el plan, muéstralo arriba una vez.
- Barra inferior: Inicio, Ejercicios, Progreso, Historial, Perfil.

Todo sale del Plan vigente y de las Sesiones guardadas; nada escrito a mano en la pantalla.
