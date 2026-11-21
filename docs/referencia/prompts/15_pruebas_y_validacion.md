# Prompt 15: pruebas y validación

Sin imagen.

---

Agrega pruebas y una forma de validar las mediciones.

PRUEBAS AUTOMÁTICAS
- Unitarias para metrics/: manos sintéticas con ángulos y distancias conocidos; el resultado debe coincidir con una tolerancia definida.
- Grabador de puntos: un modo de depuración que guarda los landmarks de una sesión en JSON (sin video) y un reproductor que los inyecta en el juego. Úsalo para probar la detección de agarres sin cámara y de forma repetible.
- Flujo completo de paciente y de terapeuta con una cámara simulada.
- Prueba de integridad: modificar un dato de una sesión cerrada hace que el historial muestre "Alterado".

PROTOCOLO DE VALIDACIÓN (escríbelo en docs/validacion.md)
- Apertura de pinza: sostener objetos de 2, 4 y 6 cm; 10 repeticiones por objeto, a 40, 50 y 60 cm de la cámara. Registrar valor medido y valor real.
- Ángulos: comparar la flexión del índice contra un goniómetro en 3 posiciones.
- Condiciones: buena luz y poca luz; mano izquierda y derecha; al menos 3 teléfonos distintos.
- Una pantalla de depuración donde anotar el valor real y que calcule el error medio y la dispersión.

Al terminar, dame una tabla con el error de cada métrica y dime cuáles no son confiables todavía.
