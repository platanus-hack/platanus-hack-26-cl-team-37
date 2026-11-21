-- limpiar_sesiones_prueba con lista de ids opcional: los e2e corren en paralelo y una limpieza "desde una fecha"
-- borraba también la sesión que otra prueba estaba usando. Con p_ids se borran solo esas (siempre con las mismas
-- reglas: solo service_role, solo pacientes demo, solo 'preparada' o 'en curso', creadas desde p_desde).
drop function if exists public.limpiar_sesiones_prueba(timestamptz);
create or replace function public.limpiar_sesiones_prueba(p_desde timestamptz, p_ids text[] default null) returns setof text
language plpgsql security definer set search_path = public as $$
declare ids text[];
begin
  perform set_config('manoviva.borrado_titular', 'on', true);
  select coalesce(array_agg(s.id), '{}') into ids
    from sesiones s
    join pacientes x on x.id = s.paciente_id
    join perfiles p on p.id = x.usuario_id
    where p.demo and s.estado in ('preparada', 'en curso') and s.creada >= p_desde
      and (p_ids is null or s.id = any(p_ids));
  delete from eventos_sesion where sesion_id = any(ids);
  delete from alertas where sesion_id = any(ids);
  return query delete from sesiones where id = any(ids) and estado <> 'cerrada' returning id;
end $$;
revoke execute on function public.limpiar_sesiones_prueba(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.limpiar_sesiones_prueba(timestamptz, text[]) to service_role;
