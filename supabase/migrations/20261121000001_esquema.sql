-- ManoViva: esquema base
-- Reglas clave:
--  * El video nunca llega aquí: solo puntos, eventos y métricas.
--  * Sesión cerrada = inmutable (trigger).
--  * Auditoría solo-agregar (trigger que bloquea UPDATE/DELETE).
--  * Planes versionados: nunca se editan, se crea una versión nueva.
--  * RLS: el paciente ve lo suyo; el terapeuta ve a sus pacientes que comparten métricas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tablas
create table public.clinicas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^CRM-[0-9]{4}$'),
  nombre text not null
);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('paciente','terapeuta')),
  nombre text not null,
  titulo text,                       -- p.ej. "Klgo."
  clinica_id uuid not null references public.clinicas(id),
  demo boolean not null default false
);

create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.perfiles(id) on delete cascade,
  terapeuta_id uuid references public.perfiles(id),
  mano_afectada text not null default 'derecha' check (mano_afectada in ('izquierda','derecha','ambas')),
  condicion text,
  fecha_inicio date not null default current_date,
  largo_mano_cm numeric(4,1),
  compartir_metricas boolean not null default true,
  datos_investigacion boolean not null default false,
  ultimo_mensaje_visto int not null default 0
);

create table public.planes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  version int not null,
  vigente_desde timestamptz not null default now(),
  creado_por uuid references public.perfiles(id),
  sesiones_por_semana int not null check (sesiones_por_semana between 1 and 14),
  umbral_dolor int not null check (umbral_dolor between 1 and 10),
  mensaje text check (char_length(mensaje) <= 280),
  items jsonb not null default '[]',
  unique (paciente_id, version)
);

create table public.sesiones (
  id text primary key check (id ~ '^S-[0-9]{8}-[0-9]{2,}$'),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  plan_version int,
  juego text not null,
  parametros jsonb not null default '{}',
  inicio timestamptz,
  fin timestamptz,
  estado text not null default 'preparada' check (estado in ('preparada','en curso','cerrada')),
  calibracion jsonb,
  metricas jsonb,
  muestras jsonb,
  dolor_eva int check (dolor_eva between 0 and 10),
  esfuerzo text check (esfuerzo in ('Muy suave','Suave','Moderado','Fuerte','Muy fuerte')),
  nota text check (char_length(nota) <= 280),
  dispositivo jsonb,
  version_app text,
  version_modelo text,
  hash text,
  creada timestamptz not null default now()
);
create index on public.sesiones (paciente_id, inicio desc);

create table public.eventos_sesion (
  id bigint generated always as identity primary key,
  sesion_id text not null references public.sesiones(id) on delete cascade,
  seq int not null,
  t double precision not null,
  tipo text not null check (tipo in ('agarre_inicio','agarre_fin','soltar','perdida_seguimiento','pausa','reanudar')),
  mano text,
  objeto text,
  datos jsonb,
  unique (sesion_id, seq)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  quien uuid,
  cuando timestamptz not null default now(),
  accion text not null,
  entidad text not null,
  entidad_id text,
  paciente_id uuid,
  antes jsonb,
  despues jsonb
);
create index on public.auditoria (paciente_id, cuando desc);

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  version text not null,
  firmado_el timestamptz not null default now(),
  opciones jsonb not null default '{}'
);

create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  sesion_id text references public.sesiones(id) on delete cascade,
  tipo text not null check (tipo in ('dolor')),
  valor int,
  creada timestamptz not null default now(),
  estado text not null default 'abierta' check (estado in ('abierta','revisada')),
  revisada_por uuid references public.perfiles(id),
  revisada_el timestamptz
);

create table public.citas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  terapeuta_id uuid not null references public.perfiles(id),
  fecha timestamptz not null,
  modalidad text not null default 'presencial'
);

-- ---------------------------------------------------------------- helpers
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as
$$ select rol from perfiles where id = auth.uid() $$;

create or replace function public.mi_paciente_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from pacientes where usuario_id = auth.uid() $$;

-- ¿El usuario actual puede ver los datos clínicos de este paciente?
create or replace function public.puede_ver_paciente(p uuid) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from pacientes x
    where x.id = p
      and (x.usuario_id = auth.uid()
           or (x.terapeuta_id = auth.uid() and x.compartir_metricas))
  )
$$;

create or replace function public.es_mi_terapeuta_de(p uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from pacientes x where x.id = p and x.terapeuta_id = auth.uid() and x.compartir_metricas) $$;

-- ---------------------------------------------------------------- inmutabilidad
create or replace function public.tg_auditoria_solo_agregar() returns trigger
language plpgsql as $$
begin
  raise exception 'auditoria es de solo agregar';
end $$;
create trigger auditoria_no_update before update on public.auditoria
  for each row execute function public.tg_auditoria_solo_agregar();
create trigger auditoria_no_delete before delete on public.auditoria
  for each row execute function public.tg_auditoria_solo_agregar();

create or replace function public.tg_planes_inmutables() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('manoviva.borrado_titular', true) = 'on' then
    return old;
  end if;
  raise exception 'los planes no se editan: crea una versión nueva';
end $$;
create trigger planes_no_update before update or delete on public.planes
  for each row execute function public.tg_planes_inmutables();

create or replace function public.tg_sesion_cerrada() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'cerrada' and coalesce(current_setting('manoviva.borrado_titular', true),'') <> 'on' then
      raise exception 'sesión cerrada: no se puede borrar';
    end if;
    return old;
  end if;
  if old.estado = 'cerrada' then
    raise exception 'sesión cerrada: es inmutable';
  end if;
  if new.id <> old.id or new.paciente_id <> old.paciente_id then
    raise exception 'no se puede cambiar el id ni el paciente';
  end if;
  if new.estado = 'cerrada' and new.hash is null then
    raise exception 'para cerrar una sesión se requiere el hash';
  end if;
  return new;
end $$;
create trigger sesiones_inmutables before update or delete on public.sesiones
  for each row execute function public.tg_sesion_cerrada();

create or replace function public.tg_eventos_inmutables() returns trigger
language plpgsql as $$
declare est text;
begin
  if tg_op = 'INSERT' then
    select estado into est from sesiones where id = new.sesion_id;
    if est = 'cerrada' then raise exception 'sesión cerrada: no admite eventos'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and current_setting('manoviva.borrado_titular', true) = 'on' then
    return old;
  end if;
  raise exception 'los eventos de sesión no se editan ni se borran';
end $$;
create trigger eventos_inmutables before insert or update or delete on public.eventos_sesion
  for each row execute function public.tg_eventos_inmutables();

-- ---------------------------------------------------------------- RLS
alter table public.clinicas enable row level security;
alter table public.perfiles enable row level security;
alter table public.pacientes enable row level security;
alter table public.planes enable row level security;
alter table public.sesiones enable row level security;
alter table public.eventos_sesion enable row level security;
alter table public.auditoria enable row level security;
alter table public.consentimientos enable row level security;
alter table public.alertas enable row level security;
alter table public.citas enable row level security;

create policy clinicas_sel on public.clinicas for select to authenticated
  using (id = (select clinica_id from perfiles where id = auth.uid()));

create policy perfiles_sel on public.perfiles for select to authenticated using (
  id = auth.uid()
  or id = (select terapeuta_id from pacientes where usuario_id = auth.uid())
  or exists (select 1 from pacientes x where x.usuario_id = perfiles.id and x.terapeuta_id = auth.uid() and x.compartir_metricas)
);

create policy pacientes_sel on public.pacientes for select to authenticated
  using (usuario_id = auth.uid() or (terapeuta_id = auth.uid() and compartir_metricas));

create policy planes_sel on public.planes for select to authenticated using (public.puede_ver_paciente(paciente_id));

create policy sesiones_sel on public.sesiones for select to authenticated using (public.puede_ver_paciente(paciente_id));
create policy sesiones_ins on public.sesiones for insert to authenticated with check (paciente_id = public.mi_paciente_id());
create policy sesiones_upd on public.sesiones for update to authenticated
  using (paciente_id = public.mi_paciente_id()) with check (paciente_id = public.mi_paciente_id());

create policy eventos_sel on public.eventos_sesion for select to authenticated
  using (exists (select 1 from sesiones s where s.id = sesion_id and public.puede_ver_paciente(s.paciente_id)));
create policy eventos_ins on public.eventos_sesion for insert to authenticated
  with check (exists (select 1 from sesiones s where s.id = sesion_id and s.paciente_id = public.mi_paciente_id()));

create policy auditoria_sel on public.auditoria for select to authenticated
  using (quien = auth.uid() or (paciente_id is not null and public.puede_ver_paciente(paciente_id)));
create policy auditoria_ins on public.auditoria for insert to authenticated with check (quien = auth.uid());

create policy consent_sel on public.consentimientos for select to authenticated using (public.puede_ver_paciente(paciente_id));
create policy consent_ins on public.consentimientos for insert to authenticated with check (paciente_id = public.mi_paciente_id());

create policy alertas_sel on public.alertas for select to authenticated using (public.puede_ver_paciente(paciente_id));
create policy alertas_ins on public.alertas for insert to authenticated with check (paciente_id = public.mi_paciente_id());

create policy citas_sel on public.citas for select to authenticated using (public.puede_ver_paciente(paciente_id));

-- ---------------------------------------------------------------- RPC
-- Verifica que el usuario tenga el rol elegido y pertenezca a la clínica del código.
create or replace function public.verificar_acceso(p_rol text, p_codigo text) returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from perfiles p join clinicas c on c.id = p.clinica_id
    where p.id = auth.uid() and p.rol = p_rol and c.codigo = upper(p_codigo)
  )
$$;

-- Nueva versión del plan (nunca edita la anterior) + auditoría con antes/después.
create or replace function public.crear_version_plan(
  p_paciente uuid, p_sesiones_por_semana int, p_umbral_dolor int, p_mensaje text, p_items jsonb
) returns public.planes
language plpgsql security definer set search_path = public as $$
declare ant planes; nuevo planes;
begin
  if not public.es_mi_terapeuta_de(p_paciente) then
    raise exception 'sin permiso sobre este paciente';
  end if;
  select * into ant from planes where paciente_id = p_paciente order by version desc limit 1;
  insert into planes (paciente_id, version, creado_por, sesiones_por_semana, umbral_dolor, mensaje, items)
  values (p_paciente, coalesce(ant.version, 0) + 1, auth.uid(), p_sesiones_por_semana, p_umbral_dolor,
          nullif(trim(p_mensaje), ''), p_items)
  returning * into nuevo;
  insert into auditoria (quien, accion, entidad, entidad_id, paciente_id, antes, despues)
  values (auth.uid(), 'plan_actualizado', 'plan', nuevo.id::text, p_paciente,
          case when ant.id is null then null else jsonb_build_object(
            'version', ant.version, 'sesionesPorSemana', ant.sesiones_por_semana,
            'umbralDolor', ant.umbral_dolor, 'items', ant.items) end,
          jsonb_build_object('version', nuevo.version, 'sesionesPorSemana', nuevo.sesiones_por_semana,
            'umbralDolor', nuevo.umbral_dolor, 'items', nuevo.items, 'mensaje', nuevo.mensaje));
  return nuevo;
end $$;

-- Ajustes de privacidad del paciente (con auditoría).
create or replace function public.actualizar_privacidad(p_compartir boolean, p_investigacion boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ant pacientes;
begin
  select * into ant from pacientes where usuario_id = auth.uid();
  if ant.id is null then raise exception 'no es paciente'; end if;
  update pacientes set compartir_metricas = p_compartir, datos_investigacion = p_investigacion where id = ant.id;
  insert into auditoria (quien, accion, entidad, entidad_id, paciente_id, antes, despues)
  values (auth.uid(), 'privacidad_actualizada', 'paciente', ant.id::text, ant.id,
    jsonb_build_object('compartirMetricas', ant.compartir_metricas, 'datosInvestigacion', ant.datos_investigacion),
    jsonb_build_object('compartirMetricas', p_compartir, 'datosInvestigacion', p_investigacion));
end $$;

create or replace function public.marcar_mensaje_visto(p_version int) returns void
language sql security definer set search_path = public as $$
  update pacientes set ultimo_mensaje_visto = greatest(ultimo_mensaje_visto, p_version) where usuario_id = auth.uid()
$$;

-- El terapeuta marca una alerta como revisada (con auditoría).
create or replace function public.revisar_alerta(p_alerta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a alertas;
begin
  select * into a from alertas where id = p_alerta;
  if a.id is null or not public.es_mi_terapeuta_de(a.paciente_id) then raise exception 'sin permiso'; end if;
  update alertas set estado = 'revisada', revisada_por = auth.uid(), revisada_el = now() where id = p_alerta;
  insert into auditoria (quien, accion, entidad, entidad_id, paciente_id, antes, despues)
  values (auth.uid(), 'alerta_revisada', 'alerta', p_alerta::text, a.paciente_id,
          jsonb_build_object('estado', a.estado), jsonb_build_object('estado', 'revisada'));
end $$;

-- Derecho del titular a eliminar sus datos clínicos. Deja constancia en auditoría (sin datos clínicos).
create or replace function public.eliminar_mis_datos() returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from pacientes where usuario_id = auth.uid();
  if pid is null then raise exception 'no es paciente'; end if;
  perform set_config('manoviva.borrado_titular', 'on', true);
  delete from eventos_sesion where sesion_id in (select id from sesiones where paciente_id = pid);
  delete from alertas where paciente_id = pid;
  delete from sesiones where paciente_id = pid;
  delete from planes where paciente_id = pid;
  delete from consentimientos where paciente_id = pid;
  delete from citas where paciente_id = pid;
  update pacientes set largo_mano_cm = null, condicion = null, compartir_metricas = false,
    datos_investigacion = false where id = pid;
  insert into auditoria (quien, accion, entidad, entidad_id, paciente_id)
  values (auth.uid(), 'datos_eliminados_por_titular', 'paciente', pid::text, pid);
end $$;

revoke execute on function public.eliminar_mis_datos() from anon;
revoke execute on function public.crear_version_plan(uuid,int,int,text,jsonb) from anon;
revoke execute on function public.actualizar_privacidad(boolean,boolean) from anon;
revoke execute on function public.revisar_alerta(uuid) from anon;
