-- Applied remotely as 20261110213649. Keep the RLS helper outside exposed API schemas.
create schema if not exists brasa_private;
revoke all on schema brasa_private from public,anon;
grant usage on schema brasa_private to authenticated,service_role;
alter function public.is_staff() set schema brasa_private;
