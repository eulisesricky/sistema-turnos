-- Migración: crear la tabla settings si no existe.
-- La definición original vive en db/supabase_schema.sql, pero algunos
-- proyectos existentes nunca llegaron a ejecutarla. Esta migración la
-- crea de forma idempotente para que el panel de Configuración pueda
-- guardar parallel_capacity, buffer_percentage y display_mode.
--
-- Ejecutar una sola vez en Supabase (SQL editor).

create table if not exists settings (
  id uuid not null primary key default gen_random_uuid(),
  business_id uuid references businesses(id),
  parallel_capacity int not null default 2,
  buffer_percentage int not null default 20,
  display_mode text not null default 'timer',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_settings_business_id on settings (business_id);

alter table settings enable row level security;
