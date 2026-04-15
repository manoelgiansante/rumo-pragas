-- MCP API Tokens — projeto shared jxcnfyeemdltdfqtgbcl
-- Consumido por: rumo-pragas, campo-vivo, rumo-finance, rumo-confinamento, rumo-operacional.
-- Fase 1: tokens hardcoded via env MCP_API_TOKEN (um por app).
-- Fase 2: esta tabela é fonte de verdade (token_hash + scopes + app_slug).

create table if not exists public.mcp_api_tokens (
  id uuid primary key default gen_random_uuid(),
  app_slug text not null check (app_slug in ('rumo-pragas','campo-vivo','rumo-finance','rumo-confinamento','rumo-operacional')),
  name text not null,
  token_hash text not null unique,
  scopes text[] not null default array[]::text[],
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  rate_limit_per_min int not null default 30,
  notes text
);

create index if not exists mcp_api_tokens_app_idx on public.mcp_api_tokens(app_slug);
create index if not exists mcp_api_tokens_active_idx on public.mcp_api_tokens(revoked_at) where revoked_at is null;

alter table public.mcp_api_tokens enable row level security;

-- NENHUMA policy para roles 'authenticated' / 'anon'.
-- Admin-only via service_role.

comment on table public.mcp_api_tokens is 'Tokens de API dos MCP servers (x-ia-hub-token). Admin-only, service_role apenas. Compartilhado por todos os apps exceto Rumo Máquinas.';
comment on column public.mcp_api_tokens.token_hash is 'SHA-256 hex do token. NUNCA plaintext.';
comment on column public.mcp_api_tokens.scopes is 'Lista de tools permitidas (vazio = todas).';
comment on column public.mcp_api_tokens.app_slug is 'App alvo do token (um token vale apenas para um app).';
