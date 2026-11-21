-- ID legible y único global: S-AAAAMMDD-NN (NN correlativo del día en toda la base).
create or replace function public.siguiente_id_sesion(p_dia text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_dia !~ '^[0-9]{8}$' then raise exception 'día inválido'; end if;
  perform pg_advisory_xact_lock(hashtext('sesion-' || p_dia));
  select coalesce(max(split_part(id, '-', 3)::int), 0) + 1 into n from sesiones where id like 'S-' || p_dia || '-%';
  return 'S-' || p_dia || '-' || lpad(n::text, 2, '0');
end $$;
revoke execute on function public.siguiente_id_sesion(text) from anon;
