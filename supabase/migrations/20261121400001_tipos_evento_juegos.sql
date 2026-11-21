-- Tipos de evento de todos los juegos (J1–J6), definidos de una vez para que ningún juego
-- tenga que volver a tocar esta regla. Los tipos anteriores se mantienen.
alter table public.eventos_sesion drop constraint if exists eventos_sesion_tipo_check;
alter table public.eventos_sesion add constraint eventos_sesion_tipo_check check (tipo in (
  -- base
  'agarre_inicio','agarre_fin','soltar','perdida_seguimiento','pausa','reanudar',
  -- J1 Torre de cubos
  'tomar','colocado','caida',
  -- J2 Pinza fina / J3 Atrapa burbujas
  'objetivo_mostrado','toque','error','no_alcanzado','reventada','intento_cerrado','expirada',
  -- J4 Exprime la naranja
  'cierre_inicio','umbral_alcanzado','sostenido_completo','apertura_completa','repeticion_incompleta',
  -- J5 Memoria de cartas
  'sobre_carta','volteo','par','no_par','retorno_palma_abajo',
  -- J6 Piano de dedos
  'nota_mostrada','acierto','dedo_equivocado','nota_perdida'
));
