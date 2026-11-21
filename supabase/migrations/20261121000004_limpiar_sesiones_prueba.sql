-- Limpieza de sesiones de PRUEBA (las que dejan los e2e y las capturas): solo service_role, solo pacientes demo,
-- solo sesiones NO cerradas ('preparada' o 'en curso') creadas desde p_desde. Una sesión 'en curso' puede tener
-- eventos, que el trigger tg_eventos_inmutables no deja borrar salvo con manoviva.borrado_titular = 'on'
-- (el mismo permiso que usan eliminar_mis_datos y reset_demo). Las sesiones cerradas no se tocan nunca.
create or replace function public.limpiar_sesiones_prueba(p_desde timestamptz) returns setof text
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manoviva.borrado_titular', 'on', true);
  create temporary table if not exists _objetivo (id text) on commit drop;
  delete from _objetivo;
  insert into _objetivo
    select s.id from sesiones s
    join pacientes x on x.id = s.paciente_id
    join perfiles p on p.id = x.usuario_id
    where p.demo and s.estado in ('preparada', 'en curso') and s.creada >= p_desde;
  delete from eventos_sesion where sesion_id in (select id from _objetivo);
  delete from alertas where sesion_id in (select id from _objetivo);
  return query delete from sesiones where id in (select id from _objetivo) and estado <> 'cerrada' returning id;
end $$;
revoke execute on function public.limpiar_sesiones_prueba(timestamptz) from public, anon, authenticated;
grant execute on function public.limpiar_sesiones_prueba(timestamptz) to service_role;
