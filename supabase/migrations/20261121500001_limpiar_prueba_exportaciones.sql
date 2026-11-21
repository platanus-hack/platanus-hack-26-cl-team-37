-- F15: las exportaciones (PDF/CSV) quedan en auditoría con las sesiones incluidas en despues->'sesiones'. Al limpiar
-- sesiones del paciente de PRUEBA por id, también se borran sus filas de auditoría de exportación (solo de ese paciente,
-- solo service_role). Mismo cuerpo que 20261121000007 + la condición de exportaciones.
create or replace function public.limpiar_paciente_prueba(p_ids text[] default null) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  uid uuid;
  ids text[];
begin
  select x.id, x.usuario_id into pid, uid
    from pacientes x
    join perfiles p on p.id = x.usuario_id
    join auth.users u on u.id = x.usuario_id
    where p.demo and lower(u.email) = 'prueba.demo@example.com';
  if pid is null then
    return;
  end if;
  perform set_config('manoviva.borrado_titular', 'on', true);
  perform set_config('manoviva.reset_demo', 'on', true);
  select coalesce(array_agg(s.id), '{}') into ids
    from sesiones s
    where s.paciente_id = pid and (p_ids is null or s.id = any(p_ids));
  delete from eventos_sesion where sesion_id = any(ids);
  delete from alertas where sesion_id = any(ids) or (p_ids is null and paciente_id = pid);
  delete from auditoria
    where (paciente_id = pid and (p_ids is null or entidad_id = any(ids)
           or (accion like 'exportar\_%' and jsonb_typeof(despues->'sesiones') = 'array' and (despues->'sesiones') ?| ids)))
       or (p_ids is null and quien = uid);
  return query delete from sesiones where id = any(ids) returning id;
end $$;
revoke execute on function public.limpiar_paciente_prueba(text[]) from public, anon, authenticated;
grant execute on function public.limpiar_paciente_prueba(text[]) to service_role;
