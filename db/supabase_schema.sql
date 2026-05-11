-- Supabase schema for sistema-turnos MVP
-- Tables: businesses, products, queues, turns, customers
-- Row Level Security enabled on all tables

create extension if not exists "pgcrypto";

create type queue_status as enum ('active', 'paused');
create type turn_status as enum ('waiting', 'called', 'completed', 'cancelled');

create table businesses (
  id uuid not null primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  wifi_qr_image_url text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid not null primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  estimated_minutes int not null default 0
);
create index idx_products_business_id on products (business_id);

create table queues (
  id uuid not null primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  status queue_status not null default 'active',
  created_at timestamptz not null default now()
);
create index idx_queues_business_id on queues (business_id);

create table turns (
  id uuid not null primary key default gen_random_uuid(),
  queue_id uuid not null references queues(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  customer_name text not null,
  whatsapp text,
  turn_number int not null,
  status turn_status not null default 'waiting',
  estimated_wait_minutes int not null default 0,
  token text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_turns_queue_id on turns (queue_id);
create index idx_turns_business_id on turns (business_id);
create index idx_turns_queue_turn_number on turns (queue_id, turn_number);
create index idx_turns_created_at on turns (created_at);

create table customers (
  id uuid not null primary key default gen_random_uuid(),
  whatsapp text not null,
  name text not null,
  business_id uuid not null references businesses(id) on delete cascade,
  last_visit timestamptz
);
create unique index idx_customers_business_whatsapp on customers (business_id, whatsapp);
create index idx_customers_business_id on customers (business_id);
create index idx_customers_last_visit on customers (last_visit);

alter table businesses enable row level security;
alter table products enable row level security;
alter table queues enable row level security;
alter table turns enable row level security;
alter table customers enable row level security;

create policy "Authenticated can select businesses" on businesses
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert businesses" on businesses
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update businesses" on businesses
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated can delete businesses" on businesses
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can select products" on products
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert products" on products
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update products" on products
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated can delete products" on products
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can select queues" on queues
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert queues" on queues
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update queues" on queues
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated can delete queues" on queues
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can select turns" on turns
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert turns" on turns
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update turns" on turns
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated can delete turns" on turns
  for delete using (auth.role() = 'authenticated');

create policy "Authenticated can select customers" on customers
  for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert customers" on customers
  for insert with check (auth.role() = 'authenticated');
create policy "Authenticated can update customers" on customers
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated can delete customers" on customers
  for delete using (auth.role() = 'authenticated');
