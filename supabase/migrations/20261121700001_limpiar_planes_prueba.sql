-- F17: los e2e de prescripción crean versiones nuevas del plan del paciente de PRUEBA (prueba.demo@example.com), con su
-- auditoría 'plan_actualizado'. Los planes son inmutables, así que esta función (solo service_role, scripts/) borra
-- las versiones > 1 de ESE paciente y sus filas de auditoría de entidad 'plan', con el mismo permiso de borrado que
-- usan limpiar_paciente_prueba / eliminar_mis_datos. No toca a ningún otro paciente ni la versión 1.
-- Devuelve cuántas versiones borró.
create or replace function public.limpiar_planes_prueba() returns int
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  n int;
begin
  select x.id into pid
    from pacientes x
    join perfiles p on p.id = x.usuario_id
    join auth.users u on u.id = x.usuario_id
    where p.demo and lower(u.email) = 'prueba.demo@example.com';
  if pid is null then
    return 0;
  end if;
  perform set_config('manoviva.borrado_titular', 'on', true);
  perform set_config('manoviva.reset_demo', 'on', true);
  delete from auditoria where paciente_id = pid and entidad = 'plan';
  delete from planes where paciente_id = pid and version > 1;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.limpiar_planes_prueba() from public, anon, authenticated;
grant execute on function public.limpiar_planes_prueba() to service_role;
