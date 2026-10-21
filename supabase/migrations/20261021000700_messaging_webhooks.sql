-- =============================================================================
-- Mensajería omnicanal (V3) y webhooks idempotentes.
-- Se define desde ahora para fijar las garantías de datos:
--  * webhook_events: unicidad (proveedor, id del evento) → los duplicados se ignoran.
--  * messages: el bot NO puede escribir si la conversación no está en 'automatic'.
-- =============================================================================

create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,                -- whatsapp, messenger, instagram, manychat, mercadopago…
  event_id text not null,
  received_at timestamptz not null default now(),
  signature_valid boolean not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'ignored')),
  attempts int not null default 0,
  last_error text,
  processed_at timestamptz,
  unique (provider, event_id)
);

-- Devuelve true si el evento es nuevo; false si es duplicado. Solo el servidor (service_role).
create or replace function public.ingest_webhook_event(p_provider text, p_event_id text, p_payload jsonb, p_signature_valid boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_service_role() then perform app.fail('FORBIDDEN'); end if;
  if not p_signature_valid then
    perform app.fail('INVALID_SIGNATURE');
  end if;
  insert into public.webhook_events (provider, event_id, payload, signature_valid)
  values (p_provider, p_event_id, p_payload, p_signature_valid)
  on conflict (provider, event_id) do nothing;
  return found;
end $$;

create type public.conversation_state as enum ('automatic', 'pending_human', 'assigned', 'in_progress', 'resolved');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'messenger', 'instagram', 'web')),
  external_thread_id text not null,
  client_id uuid references public.clients (id),
  state public.conversation_state not null default 'automatic',
  assigned_staff_id uuid references public.staff_members (id),
  handover_reason text,
  bot_failures int not null default 0,
  last_inbound_at timestamptz,          -- para la ventana de 24 h de Meta
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_thread_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('customer', 'bot', 'agent', 'system')),
  sender_staff_id uuid references public.staff_members (id),
  body text,
  media_path text,
  provider_message_id text,
  in_reply_to uuid references public.messages (id),
  status text not null default 'received',
  created_at timestamptz not null default now()
);
create unique index messages_provider_uq on public.messages (conversation_id, provider_message_id) where provider_message_id is not null;
-- Un solo mensaje de salida por mensaje entrante: evita que bot y humano respondan lo mismo.
create unique index messages_one_reply_uq on public.messages (in_reply_to) where direction = 'outbound' and in_reply_to is not null;

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_staff_id uuid references public.staff_members (id),
  body text not null,
  created_at timestamptz not null default now()
);

create or replace function app.guard_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = new.conversation_id for update;
  if new.sender_type = 'bot' and c.state <> 'automatic' then
    raise exception 'BOT_SILENCED' using detail = 'La conversación está en manos de una persona';
  end if;
  if new.sender_type = 'agent' then
    update public.conversations set state = 'in_progress',
           assigned_staff_id = coalesce(assigned_staff_id, new.sender_staff_id), updated_at = now()
     where id = c.id and state <> 'resolved';
  end if;
  if new.direction = 'inbound' then
    update public.conversations set last_inbound_at = new.created_at, updated_at = now(),
           state = case when state = 'resolved' then 'pending_human' else state end
     where id = c.id;
  end if;
  return new;
end $$;
create trigger messages_guard before insert on public.messages for each row execute function app.guard_message();

create or replace function public.escalate_conversation(p_conversation uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (app.is_service_role() or app.has_role('owner', 'admin', 'receptionist')) then perform app.fail('FORBIDDEN'); end if;
  update public.conversations set state = 'pending_human', handover_reason = p_reason, updated_at = now()
   where id = p_conversation and state in ('automatic', 'resolved');
  insert into public.ops_alerts (kind, reference_type, reference_id, message)
  values ('conversation_handover', 'conversation', p_conversation::text, 'Conversación requiere atención humana: ' || p_reason);
end $$;

create or replace function public.reactivate_bot(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_role('owner', 'admin', 'receptionist');
  update public.conversations set state = 'automatic', assigned_staff_id = null, handover_reason = null, bot_failures = 0, updated_at = now()
   where id = p_conversation and state = 'resolved';
  if not found then perform app.fail('RESOLVE_FIRST'); end if;
end $$;
