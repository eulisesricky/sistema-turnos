-- Migración: hacer permisivas las policies de la tabla settings.
-- El cajero usa la clave anon (no autenticada), por lo que las policies
-- originales con `auth.role() = 'authenticated'` rechazaban el upsert.
-- El resto de las tablas del proyecto (turns, etc.) ya funciona con anon.
--
-- Ejecutar una sola vez en Supabase (SQL editor).

drop policy if exists "Authenticated can select settings" on settings;
drop policy if exists "Authenticated can insert settings" on settings;
drop policy if exists "Authenticated can update settings" on settings;
drop policy if exists "Authenticated can delete settings" on settings;

create policy "Anyone can select settings" on settings
  for select using (true);
create policy "Anyone can insert settings" on settings
  for insert with check (true);
create policy "Anyone can update settings" on settings
  for update using (true) with check (true);
create policy "Anyone can delete settings" on settings
  for delete using (true);
