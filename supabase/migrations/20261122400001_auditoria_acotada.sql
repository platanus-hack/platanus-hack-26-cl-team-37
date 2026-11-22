-- Coordinación · Acota quién puede escribir en la auditoría y quién puede ejecutar las funciones de la app.
-- No da más acceso a nadie: solo quita. No borra ni cambia datos.
--
-- 1) auditoria_ins. Antes bastaba con `quien = auth.uid()`: cualquier cuenta con sesión podía insertar filas de auditoría
--    con el `paciente_id` de OTRA persona (p. ej. un "plan_actualizado" falso en el registro de otro paciente), y esa fila la
--    veían ese paciente y su terapeuta. Ahora la fila debe ser propia y, si nombra a un paciente, tiene que ser uno que la
--    cuenta puede ver (el propio, o un paciente del terapeuta que comparte métricas). Lo que la app escribe hoy (exportar
--    PDF/CSV del paciente o de su terapeuta) sigue pasando. Las funciones security definer (plan, privacidad, alertas,
--    largo de mano, eliminar datos) no dependen de esta política.
alter policy auditoria_ins on public.auditoria
  with check (
    quien = auth.uid()
    and (paciente_id is null or public.puede_ver_paciente(paciente_id))
  );

-- 2) Funciones de la app. En Postgres toda función nace ejecutable por PUBLIC, así que el `revoke … from anon` de las
--    migraciones 20261121000001 y 20261121000002 no quitaba nada (anon lo seguía teniendo vía PUBLIC). Todas revisan
--    auth.uid() por dentro, por eso no había fuga de datos; esto solo cierra la puerta que se creía cerrada.
revoke execute on function public.eliminar_mis_datos() from public, anon;
revoke execute on function public.crear_version_plan(uuid, int, int, text, jsonb) from public, anon;
revoke execute on function public.actualizar_privacidad(boolean, boolean) from public, anon;
revoke execute on function public.revisar_alerta(uuid) from public, anon;
revoke execute on function public.marcar_mensaje_visto(int) from public, anon;
revoke execute on function public.siguiente_id_sesion(text) from public, anon;

grant execute on function public.eliminar_mis_datos() to authenticated, service_role;
grant execute on function public.crear_version_plan(uuid, int, int, text, jsonb) to authenticated, service_role;
grant execute on function public.actualizar_privacidad(boolean, boolean) to authenticated, service_role;
grant execute on function public.revisar_alerta(uuid) to authenticated, service_role;
grant execute on function public.marcar_mensaje_visto(int) to authenticated, service_role;
grant execute on function public.siguiente_id_sesion(text) to authenticated, service_role;
