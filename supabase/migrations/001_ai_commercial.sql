-- =====================================================================
-- 38iPhone ERP — Módulo IA Comercial (WhatsApp + Instagram)
-- Ejecutar en Supabase > SQL Editor. Es idempotente (se puede re-ejecutar).
-- =====================================================================

-- ── 0. Arreglos de inventario ────────────────────────────────────────
-- IMEI y serie únicos (solo cuando no son null) para evitar duplicados
create unique index if not exists devices_imei_unique   on public.devices (imei)          where imei is not null and imei <> '';
create unique index if not exists devices_serial_unique on public.devices (serial_number) where serial_number is not null and serial_number <> '';
create index if not exists devices_status_idx on public.devices (status);
-- Normalizar estados con espacios/mayúsculas raras
update public.devices set status = initcap(trim(status)) where status is not null and status <> initcap(trim(status));
update public.devices set status = 'En reparación' where lower(trim(status)) in ('en reparacion','en reparación');

-- ── 1. Configuración global de la IA ─────────────────────────────────
create table if not exists public.ai_settings (
  id            int primary key default 1 check (id = 1),     -- fila única
  default_mode  text not null default 'copilot' check (default_mode in ('autonomous','copilot','off')),
  business_name text not null default '38iPhone',
  tone          text not null default 'Argentino, cercano, vendedor, sin sonar robótico',
  hot_threshold int  not null default 70,   -- score >= 70 => caliente
  warm_threshold int not null default 40,   -- score >= 40 => tibio
  usd_ars_note  text,
  updated_at    timestamptz not null default now()
);
insert into public.ai_settings (id) values (1) on conflict do nothing;

-- ── 2. Conversaciones ────────────────────────────────────────────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('whatsapp','instagram')),
  external_id      text not null,                 -- WhatsApp: wa_id (teléfono) · IG: IGSID
  contact_name     text,
  contact_handle   text,                          -- @usuario IG / teléfono
  customer_id      uuid references public.customers(id) on delete set null,
  mode             text not null default 'inherit' check (mode in ('inherit','autonomous','copilot','human')),
  status           text not null default 'open' check (status in ('open','won','lost','archived')),
  -- Lead scoring
  lead_score       int  not null default 0 check (lead_score between 0 and 100),
  lead_temp        text not null default 'frio' check (lead_temp in ('frio','tibio','caliente')),
  intent           text,                          -- comprar | consulta_precio | plan_canje | soporte | otro
  interested_model text,
  interested_capacity text,
  budget_usd       numeric(10,2),
  has_trade_in     boolean not null default false,
  trade_in_model   text,
  trade_in_battery int,
  est_sale_usd     numeric(10,2) not null default 0,
  ai_summary       text,
  -- Bandeja
  last_message_at  timestamptz not null default now(),
  last_message_preview text,
  last_customer_message_at timestamptz,           -- para la ventana de 24 hs de Meta
  unread_count     int not null default 0,
  assigned_to      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (channel, external_id)
);
create index if not exists conv_hot_idx  on public.conversations (lead_score desc, last_message_at desc) where status = 'open';
create index if not exists conv_last_idx on public.conversations (last_message_at desc);

-- ── 3. Mensajes ──────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  sender          text not null check (sender in ('customer','ai','agent')),
  body            text not null,
  media_type      text,
  external_id     text,                           -- wamid / mid de Meta (idempotencia)
  delivery_status text not null default 'received' check (delivery_status in ('received','pending','sent','delivered','read','failed')),
  error           text,
  created_at      timestamptz not null default now()
);
create unique index if not exists messages_external_unique on public.messages (external_id) where external_id is not null;
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ── 4. Sugerencias de la IA (Modo Copiloto) ──────────────────────────
create table if not exists public.ai_suggestions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id      uuid references public.messages(id) on delete cascade,  -- mensaje del cliente que la originó
  reply           text not null,
  reasoning       text,
  recommendations jsonb not null default '[]'::jsonb,   -- [{type:'accessory'|'upgrade', name, price_usd, reason}]
  status          text not null default 'pending' check (status in ('pending','sent','edited_sent','discarded')),
  created_at      timestamptz not null default now()
);
create index if not exists sugg_pending_idx on public.ai_suggestions (conversation_id, created_at desc) where status = 'pending';

-- ── 5. Historial de scoring (auditoría y gráficos) ───────────────────
create table if not exists public.lead_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  score           int not null,
  temp            text not null,
  intent          text,
  signals         jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists lead_events_conv_idx on public.lead_events (conversation_id, created_at desc);

-- ── 6. Catálogo de accesorios (cross-selling) ────────────────────────
create table if not exists public.accessories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('funda','cargador','vidrio','cable','auricular','otro')),
  compatible_models text[] not null default '{}',   -- ej: {'iPhone 13','iPhone 13 Pro'}; vacío = universal
  price_usd   numeric(10,2) not null default 0,
  stock       int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── 7. Tabla de cotización de usados (Plan Canje) ────────────────────
create table if not exists public.trade_in_ranges (
  id          uuid primary key default gen_random_uuid(),
  model       text not null,
  capacity    text,
  min_usd     numeric(10,2) not null,
  max_usd     numeric(10,2) not null,
  min_battery int not null default 80,          -- por debajo, se descuenta
  battery_penalty_usd numeric(10,2) not null default 30,
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (model, capacity)
);

-- ── 8. FAQs para respuestas automáticas ──────────────────────────────
create table if not exists public.ai_faqs (
  id       uuid primary key default gen_random_uuid(),
  question text not null,
  answer   text not null,
  keywords text[] not null default '{}',
  active   boolean not null default true
);

-- ── 9. Triggers: mantener la conversación al día ─────────────────────
create or replace function public.touch_conversation() returns trigger language plpgsql as $$
begin
  update public.conversations c set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 140),
    last_customer_message_at = case when new.direction = 'in' then new.created_at else c.last_customer_message_at end,
    unread_count = case when new.direction = 'in' then c.unread_count + 1 else 0 end
  where c.id = new.conversation_id;
  return new;
end $$;
drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- ── 10. Vista de métricas del día (para el dashboard) ────────────────
create or replace view public.ai_daily_metrics with (security_invoker = true) as
select
  count(*) filter (where created_at >= date_trunc('day', now()))                                  as new_conversations_today,
  count(*) filter (where status = 'open' and lead_temp = 'caliente')                              as hot_leads,
  count(*) filter (where status = 'open' and has_trade_in and last_message_at >= date_trunc('day', now())) as trade_in_opportunities_today,
  coalesce(sum(est_sale_usd) filter (where status = 'open' and lead_temp in ('caliente','tibio')), 0) as estimated_sales_usd,
  coalesce(sum(unread_count), 0)                                                                  as unread_total
from public.conversations;

-- ── 11. Seguridad (RLS) ──────────────────────────────────────────────
-- Los webhooks usan la SERVICE ROLE KEY (ignora RLS). El ERP usa usuarios autenticados.
do $$
declare t text;
begin
  foreach t in array array['ai_settings','conversations','messages','ai_suggestions','lead_events','accessories','trade_in_ranges','ai_faqs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "auth_all_%s" on public.%I', t, t);
    execute format('create policy "auth_all_%s" on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

-- ── 12. Realtime ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['conversations','messages','ai_suggestions','devices']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── 13. Datos semilla (editá precios a tu mercado) ───────────────────
insert into public.trade_in_ranges (model, capacity, min_usd, max_usd) values
  ('iPhone 11','64GB',150,200), ('iPhone 11','128GB',170,230),
  ('iPhone 12','128GB',250,320), ('iPhone 13','128GB',340,420),
  ('iPhone 13 Pro','128GB',450,540), ('iPhone 14','128GB',430,520),
  ('iPhone 14 Pro','128GB',560,660), ('iPhone 15','128GB',560,660),
  ('iPhone 15 Pro','128GB',730,850)
on conflict (model, capacity) do nothing;

insert into public.ai_faqs (question, answer, keywords) values
  ('Horarios','Atendemos de lunes a sábado de 10 a 19 hs. Escribinos cuando quieras que te respondemos enseguida.', '{horario,hora,abren,cierran}'),
  ('Garantía','Todos los equipos salen con garantía. Te la detallamos al cerrar la compra.', '{garantia,garantía}'),
  ('Medios de pago','Aceptamos efectivo USD, transferencia y tarjeta. Consultanos por financiación.', '{pago,tarjeta,cuotas,transferencia,efectivo}'),
  ('Plan Canje','Recibimos tu iPhone usado como parte de pago. Pasanos modelo, capacidad y % de batería y te damos un rango.', '{canje,permuta,usado,trade,entrego}')
on conflict do nothing;
