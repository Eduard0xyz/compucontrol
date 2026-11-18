-- Esquema institucional de CompuControl UDH.
-- Ejecutar en el SQL Editor de Supabase después de crear el proyecto.
create extension if not exists pgcrypto;

create type public.app_role as enum ('Administrador', 'Técnico', 'Consulta');
create type public.equipment_state as enum ('Operativo', 'En mantenimiento', 'Repotenciado', 'Dado de baja');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol public.app_role not null default 'Consulta',
  created_at timestamptz not null default now()
);
create table public.pabellones (id uuid primary key default gen_random_uuid(), codigo text not null unique, nombre text not null, created_at timestamptz not null default now());
create table public.pisos (id uuid primary key default gen_random_uuid(), pabellon_id uuid not null references public.pabellones(id) on delete restrict, numero smallint not null check (numero between 1 and 20), unique (pabellon_id, numero));
create table public.ambientes (id uuid primary key default gen_random_uuid(), pabellon_id uuid not null references public.pabellones(id) on delete restrict, piso_id uuid not null references public.pisos(id) on delete restrict, numero text not null, nombre text not null, tipo text not null, unique (piso_id, numero));
create table public.laboratorios (id uuid primary key default gen_random_uuid(), ambiente_id uuid not null unique references public.ambientes(id) on delete restrict, nombre text not null);
create table public.equipos (id uuid primary key default gen_random_uuid(), codigo text not null unique, codigo_patrimonial text, serie text, tipo text not null, modelo text not null, procesador text, ram_gb numeric check (ram_gb > 0), disco text, video text, sistema_operativo text, estado public.equipment_state not null default 'Operativo', ambiente_id uuid references public.ambientes(id) on delete set null, posicion integer check (posicion > 0), responsable text, adquisicion date, garantia_hasta date, created_at timestamptz not null default now());
create table public.mantenimientos (id uuid primary key default gen_random_uuid(), equipo_id uuid not null references public.equipos(id) on delete restrict, tipo text not null, estado text not null, tecnico_id uuid references public.profiles(id) on delete set null, fecha_programada date not null, fecha_ejecucion date, costo numeric(12,2) check (costo >= 0), descripcion text not null, observaciones text, created_at timestamptz not null default now());
create table public.tickets (id uuid primary key default gen_random_uuid(), codigo text not null unique, equipo_id uuid not null references public.equipos(id) on delete restrict, tipo text not null, prioridad text not null, estado text not null, reportado_por text, tecnico_id uuid references public.profiles(id) on delete set null, descripcion text not null, diagnostico text, solucion text, observaciones text, created_at timestamptz not null default now());
create table public.repotenciaciones (id uuid primary key default gen_random_uuid(), equipo_id uuid not null references public.equipos(id) on delete restrict, fecha date not null, componente text not null, anterior text not null, nuevo text not null, motivo text not null, costo numeric(12,2) check (costo >= 0));
create table public.historial (id uuid primary key default gen_random_uuid(), equipo_id uuid references public.equipos(id) on delete set null, usuario_id uuid references public.profiles(id) on delete set null, accion text not null, detalle text not null, created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.profiles(id) on delete restrict, entidad text not null, entidad_id uuid, accion text not null, detalle jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());

create index equipos_ambiente_idx on public.equipos(ambiente_id);
create index equipos_estado_idx on public.equipos(estado);
create index mantenimientos_fecha_idx on public.mantenimientos(fecha_programada, estado);
create index tickets_equipo_estado_idx on public.tickets(equipo_id, estado);
create index historial_equipo_fecha_idx on public.historial(equipo_id, created_at desc);
create index audit_logs_fecha_idx on public.audit_logs(created_at desc);

create or replace function public.current_role() returns public.app_role language sql stable security definer set search_path = public as $$ select rol from public.profiles where id = auth.uid() $$;
alter table public.profiles enable row level security;
alter table public.pabellones enable row level security; alter table public.pisos enable row level security; alter table public.ambientes enable row level security; alter table public.laboratorios enable row level security; alter table public.equipos enable row level security; alter table public.mantenimientos enable row level security; alter table public.tickets enable row level security; alter table public.repotenciaciones enable row level security; alter table public.historial enable row level security; alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.current_role() = 'Administrador');
create policy profiles_admin on public.profiles for all to authenticated using (public.current_role() = 'Administrador') with check (public.current_role() = 'Administrador');
do $$ declare t text; begin foreach t in array array['pabellones','pisos','ambientes','laboratorios','equipos','mantenimientos','tickets','repotenciaciones','historial'] loop execute format('create policy %I_read on public.%I for select to authenticated using (true)', t, t); execute format('create policy %I_admin_write on public.%I for all to authenticated using (public.current_role() = ''Administrador'') with check (public.current_role() = ''Administrador'')', t, t); end loop; end $$;
create policy maintenance_technician_insert on public.mantenimientos for insert to authenticated with check (public.current_role() in ('Administrador','Técnico'));
create policy maintenance_technician_update on public.mantenimientos for update to authenticated using (public.current_role() in ('Administrador','Técnico')) with check (public.current_role() in ('Administrador','Técnico'));
create policy tickets_technician_insert on public.tickets for insert to authenticated with check (public.current_role() in ('Administrador','Técnico'));
create policy tickets_technician_update on public.tickets for update to authenticated using (public.current_role() in ('Administrador','Técnico')) with check (public.current_role() in ('Administrador','Técnico'));
create policy audit_insert on public.audit_logs for insert to authenticated with check (usuario_id = auth.uid());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.current_role() = 'Administrador');
