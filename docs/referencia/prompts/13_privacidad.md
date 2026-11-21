# Prompt 13: privacidad y datos

Adjuntar: imagenes/13_privacidad.png

---

Adjunto 13_privacidad.png. Construye /privacidad.

- Tarjeta inicial: "Tu video no se guarda. La cámara se analiza en tu teléfono. Solo se guardan los puntos de la mano y tus resultados."
- Interruptores:
  - Analizar en el dispositivo: siempre activo, bloqueado.
  - Guardar video de la sesión: apagado y no disponible en esta versión.
  - Compartir métricas con mi terapeuta: activado al vincularse; el paciente puede apagarlo.
  - Datos anónimos para investigación: apagado por defecto.
- Consentimiento informado: texto versionado, fecha de firma y estado. Es obligatorio antes de la primera sesión. Deja el texto en un archivo aparte para que lo redacte la clínica.
- "Descargar mis datos": JSON y CSV con todo lo del paciente.
- "Eliminar": borra los datos del paciente con doble confirmación.
- Cada cambio de estos ajustes se anota en Auditoria.

Revisión técnica: confirma que ningún cuadro de video sale del dispositivo. Revisa todas las llamadas de red, agrega una Content-Security-Policy que solo permita los orígenes necesarios y dime qué encontraste.
