# Bitácora P3

Qué hiciste, qué probaste y qué quedó pendiente. Agrega al final; un bloque por tanda de trabajo (hora, qué, resultado de las pruebas, pendiente).

## 2026-11-21 · F25 Exprime la naranja: correcciones de la revisión del PR #20

- Hecho: tarjeta de barras legible en el teléfono (diseño y colocación en píxeles CSS, ≈210×116 px, letra 15/14 px, sin lista de pasos, lienzo = diseño × min(1.5, devicePixelRatio), textura sin mipmaps con filtro lineal, material `toneMapped: false`); la raya de la marca ya no pisa la etiqueta (etiqueta "Cierre 100 %" en la barra y "marca 75 %" sobre la raya).
- Hecho: el sostén deja de sumar en el paso 4 y se guarda el tiempo pedido (3 s de sostén + 10 s de puño = 3 s); la fórmula de la métrica dice "sobre umbral − 10"; "Apretando" → "Puño cerrado", "Apretones" → "Cierres"; "Reiniciar" a mitad de una repetición emite `repeticion_incompleta` con su paso (`cortarRepeticion`).
- Pruebas: unitarias nuevas (sostén fijo en el paso 4, `cortarRepeticion` por paso, fórmula y textos del módulo; la prueba de palabras prohibidas incluye ahora apretar/apretando/apretones) y e2e ampliados (HUD 3,0 s con el puño cerrado en el paso 4, Reiniciar incompleta con eventos cerrados). Captura nueva en docs/capturas/exprime-naranja.png (844×390).
- Pendiente: panel de pasos en DOM como el resto del HUD (necesita `HudJuego.panel` de P2, contratos §8).
