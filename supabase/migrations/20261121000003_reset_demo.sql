-- Reinicio de datos de DEMOSTRACIÓN (ficticios). Solo service_role; solo toca perfiles con demo = true.
create or replace function public.tg_auditoria_solo_agregar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('manoviva.reset_demo', true) = 'on' then
    return old;
  end if;
  raise exception 'auditoria es de solo agregar';
end $$;

create or replace function public.reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('manoviva.borrado_titular', 'on', true);
  perform set_config('manoviva.reset_demo', 'on', true);
  delete from auditoria where quien in (select id from perfiles where demo)
     or paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from eventos_sesion where sesion_id in (select s.id from sesiones s join pacientes x on x.id = s.paciente_id join perfiles p on p.id = x.usuario_id where p.demo);
  delete from alertas where paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from sesiones where paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from planes where paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from consentimientos where paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from citas where paciente_id in (select x.id from pacientes x join perfiles p on p.id = x.usuario_id where p.demo);
  delete from pacientes where usuario_id in (select id from perfiles where demo);
end $$;
revoke execute on function public.reset_demo() from public, anon, authenticated;
grant execute on function public.reset_demo() to service_role;
