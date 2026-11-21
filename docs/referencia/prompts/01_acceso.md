# Prompt 1: acceso y roles

Adjuntar: imagenes/01_acceso.png

---

Adjunto 01_acceso.png. Construye la pantalla /acceso siguiendo docs/manoviva-spec.md.

- Logo, nombre y lema. Selector de rol con dos tarjetas: "Soy paciente" y "Soy terapeuta"; solo una activa.
- Campo "Código de la clínica" con formato CRM-0000. Valida y muestra un error claro.
- Botón "Ingresar" deshabilitado hasta tener rol y código válido.
- Por ahora la autenticación es simulada, detrás de una interfaz AuthService que después se pueda cambiar por un backend real sin tocar la pantalla.
- Al ingresar: paciente va a /inicio, terapeuta a /terapeuta/pacientes. Protege las rutas por rol.
- Siembra datos de demostración claramente marcados como ficticios: 1 terapeuta, 4 pacientes, un plan vigente y 19 sesiones pasadas, para que las demás pantallas tengan contenido.

Criterio de aceptación: entro con cada rol, recargo la página y sigo dentro; con rol paciente no puedo abrir rutas de terapeuta.
