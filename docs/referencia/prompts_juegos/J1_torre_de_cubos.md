# Prompt J1: Torre de cubos

Adjuntar: imagenes_juegos/01_torre_de_cubos.png

Gesto que trabaja: pinza y precisión al soltar.

---

Adjunto 01_torre_de_cubos.png. Construye el juego "Torre de cubos" sobre la base común de juegos (games/shell) y regístralo en games/registry.

CÓMO SE JUEGA
- Sobre la mesa hay una base y cubos sueltos. El paciente toma un cubo con pinza y lo suelta sobre la torre.
- Una silueta amarilla marca dónde va el próximo cubo.
- Un cubo cuenta como colocado cuando queda quieto 1 s sobre la torre.
- Si la torre se cae, se reinicia la torre (no la sesión) y se anota el evento "caida".
- Usa el motor de física que ya tiene el proyecto. La detección de agarre es la misma de Caja de juguetes.

NIVELES
- 1: cubos grandes, torre de 3, tolerancia amplia.
- 3: cubos medianos, torre de 5.
- 5: cubos chicos, torre de 6, tolerancia estrecha.
- Define los intermedios y déjalos en el registro.

MÉTRICAS
- Desvío al soltar: distancia horizontal entre el centro del cubo y el centro de la silueta, en cm.
- Apertura de pinza al tomar cada cubo.
- Estabilidad: variación de la posición de la mano durante el último segundo antes de soltar, llevada a una escala de 0 a 100.
- Altura máxima alcanzada y número de caídas.
- En vivo: desvío al soltar, apertura de pinza y estabilidad. Contador: altura / meta.

EVENTOS: tomar, soltar (con desvío), colocado, caida.

Criterio de aceptación: completo una torre en el nivel 1 con cada mano y el resumen muestra el desvío de cada cubo.
