-- F16 · Limpieza de una alerta creada por un e2e sobre un paciente DEMO (p. ej. la de dolor que el e2e del terapeuta
-- marca como revisada). Borra esa alerta y SOLO las filas de auditoría de ella (entidad 'alerta' + su id), con el mismo
-- permiso de borrado que usan limpiar_paciente_prueba / reset_demo. Solo service_role; solo si el paciente es demo.
create or replace function public.limpiar_alerta_prueba(p_alerta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a alertas;
begin
  select * into a from alertas where id = p_alerta;
  if a.id is null then
    return;
  end if;
  if not exists (
    select 1 from pacientes x join perfiles p on p.id = x.usuario_id where x.id = a.paciente_id and p.demo
  ) then
    raise exception 'solo alertas de pacientes demo';
  end if;
  perform set_config('manoviva.reset_demo', 'on', true);
  delete from auditoria where entidad = 'alerta' and entidad_id = p_alerta::text;
  delete from alertas where id = p_alerta;
end $$;
revoke execute on function public.limpiar_alerta_prueba(uuid) from public, anon, authenticated;
grant execute on function public.limpiar_alerta_prueba(uuid) to service_role;
