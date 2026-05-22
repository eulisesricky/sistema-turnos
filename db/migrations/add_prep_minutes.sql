-- Migración: agregar columna prep_minutes a la tabla turns.
-- prep_minutes guarda el tiempo de preparación del propio turno (con buffer),
-- usado como piso al recalcular estimated_wait_minutes y en el API público.
--
-- Ejecutar una sola vez en Supabase (SQL editor).

alter table turns
  add column if not exists prep_minutes integer;

-- Backfill: para turnos existentes sin prep_minutes, asumir 0 (el piso quedará desactivado para esos turnos).
-- No tocamos turnos completados o cancelados.
update turns
  set prep_minutes = 0
  where prep_minutes is null;
