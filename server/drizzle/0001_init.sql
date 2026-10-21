create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null default 'Оператор',
  status text not null default 'online',
  created_at timestamptz not null default now()
);

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  public_key text not null unique,
  color text not null default '#4f46e5',
  logo_url text,
  header_title text not null default 'Поддержка',
  greeting text not null default 'Здравствуйте! Чем можем помочь?',
  position text not null default 'right',
  offset_x integer not null default 20,
  offset_y integer not null default 20,
  quick_buttons jsonb not null default '[]',
  working_hours jsonb not null default '{}',
  timezone text not null default 'Europe/Minsk',
  offline_message text not null default 'Сейчас мы не в сети. Оставьте сообщение, и мы ответим.',
  sound_enabled boolean not null default true,
  mobile_behavior text not null default 'panel',
  hidden_pages text not null default '',
  auto_invite_enabled boolean not null default false,
  auto_invite_delay_seconds integer not null default 30,
  draft_preview_enabled boolean not null default false,
  retention_days integer not null default 365,
  created_at timestamptz not null default now()
);

create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  token text not null,
  ip text,
  user_agent text,
  city text,
  country text,
  referrer text,
  landing_url text,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists visitors_site_token_idx on visitors (site_id, token);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  visitor_id uuid not null references visitors(id) on delete cascade,
  status text not null default 'new',
  assignee_id uuid references users(id) on delete set null,
  current_page text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists conversations_site_status_idx on conversations (site_id, status);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null,
  sender_id uuid,
  body text not null,
  client_id text,
  status text not null default 'sent',
  edited boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_conversation_client_idx on messages (conversation_id, client_id);

create table if not exists message_revisions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  previous_body text not null,
  changed_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists quick_replies (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references sites(id) on delete cascade,
  category text not null default 'Общее',
  shortcut text,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
