-- Migración: agregar display_mode a la tabla settings.
-- 'timer'  → el cliente ve un temporizador con cuenta regresiva (comportamiento original).
-- 'queue'  → el cliente ve cuántos turnos tiene delante y mensajes de proximidad.
--
-- Ejecutar una sola vez en Supabase (SQL editor).

alter table settings
  add column if not exists display_mode text not null default 'timer';
