-- F19: el paciente corrige el largo de su mano (cm, medido con regla). Solo toca SU fila y deja auditoría con antes/después.
-- Rango válido 10–30 cm (el valor se guarda con 1 decimal, numeric(4,1)). Es la referencia de escala de la calibración.
create or replace function public.actualizar_largo_mano(p_cm numeric) returns void
language plpgsql security definer set search_path = public as $$
declare ant pacientes; nuevo numeric(4,1);
begin
  if p_cm is null or p_cm < 10 or p_cm > 30 then raise exception 'largo de mano fuera de rango (10 a 30 cm)'; end if;
  nuevo := round(p_cm, 1);
  select * into ant from pacientes where usuario_id = auth.uid();
  if ant.id is null then raise exception 'no es paciente'; end if;
  update pacientes set largo_mano_cm = nuevo where id = ant.id;
  insert into auditoria (quien, accion, entidad, entidad_id, paciente_id, antes, despues)
  values (auth.uid(), 'largo_mano_actualizado', 'paciente', ant.id::text, ant.id,
    jsonb_build_object('largoManoCm', ant.largo_mano_cm), jsonb_build_object('largoManoCm', nuevo));
end $$;
revoke execute on function public.actualizar_largo_mano(numeric) from public, anon;
grant execute on function public.actualizar_largo_mano(numeric) to authenticated;

-- Limpieza del e2e de F19: SOLO el paciente de PRUEBA (prueba.demo@example.com), solo service_role. Quita las filas de
-- auditoría 'largo_mano_actualizado' que creó la prueba y restaura el largo de mano original.
create or replace function public.restaurar_largo_mano_prueba(p_cm numeric) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select x.id into pid
    from pacientes x
    join perfiles p on p.id = x.usuario_id
    join auth.users u on u.id = x.usuario_id
    where p.demo and lower(u.email) = 'prueba.demo@example.com';
  if pid is null then return; end if;
  perform set_config('manoviva.reset_demo', 'on', true);
  delete from auditoria where paciente_id = pid and accion = 'largo_mano_actualizado';
  update pacientes set largo_mano_cm = p_cm where id = pid;
end $$;
revoke execute on function public.restaurar_largo_mano_prueba(numeric) from public, anon, authenticated;
grant execute on function public.restaurar_largo_mano_prueba(numeric) to service_role;
