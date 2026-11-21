-- Corrige limpiar_sesiones_prueba (20261121000004): Supabase activa pg_safeupdate y rechaza el
-- "delete from _objetivo" sin WHERE. Misma regla, sin tabla temporal: solo service_role, solo pacientes demo,
-- solo sesiones 'preparada' o 'en curso' creadas desde p_desde, con sus eventos y alertas. Nunca cerradas.
create or replace function public.limpiar_sesiones_prueba(p_desde timestamptz) returns setof text
language plpgsql security definer set search_path = public as $$
declare ids text[];
begin
  perform set_config('manoviva.borrado_titular', 'on', true);
  select coalesce(array_agg(s.id), '{}') into ids
    from sesiones s
    join pacientes x on x.id = s.paciente_id
    join perfiles p on p.id = x.usuario_id
    where p.demo and s.estado in ('preparada', 'en curso') and s.creada >= p_desde;
  delete from eventos_sesion where sesion_id = any(ids);
  delete from alertas where sesion_id = any(ids);
  return query delete from sesiones where id = any(ids) and estado <> 'cerrada' returning id;
end $$;
revoke execute on function public.limpiar_sesiones_prueba(timestamptz) from public, anon, authenticated;
grant execute on function public.limpiar_sesiones_prueba(timestamptz) to service_role;
