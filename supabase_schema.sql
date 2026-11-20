-- =============================================================================
-- PIVOT.SH - SCRIPT DE CONFIGURAÇÃO DO BANCO DE DADOS EM NUVEM (SUPABASE)
-- =============================================================================
-- Instruções:
-- 1. Acesse o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. No menu lateral esquerdo, clique em "SQL Editor" -> "New query"
-- 3. Cole todo este script abaixo e clique em "Run" (ou Ctrl + Enter)
-- =============================================================================

create table if not exists public.user_projects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  tasks jsonb not null default '[]'::jsonb,
  resources jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  nexo_state jsonb not null default '{}'::jsonb,
  row_heights jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Habilita Row Level Security (RLS) para garantir isolamento total por usuário
alter table public.user_projects enable row level security;

-- Políticas de acesso (cada usuário autenticado lê e grava apenas seu próprio user_id)
drop policy if exists "Usuarios podem ler seu proprio projeto" on public.user_projects;
create policy "Usuarios podem ler seu proprio projeto"
  on public.user_projects for select
  using (auth.uid() = user_id);

drop policy if exists "Usuarios podem inserir seu proprio projeto" on public.user_projects;
create policy "Usuarios podem inserir seu proprio projeto"
  on public.user_projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Usuarios podem atualizar seu proprio projeto" on public.user_projects;
create policy "Usuarios podem atualizar seu proprio projeto"
  on public.user_projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Coluna opcional para sincronização em nuvem do quadro branco Drafts
alter table public.user_projects
  add column if not exists drafts_state jsonb not null default '{}'::jsonb;

-- =============================================================================
-- STORAGE: BUCKET PRIVADO DE ANEXOS DAS TAREFAS E IMAGENS DO DRAFTS (10 MB)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-attachments', 'task-attachments', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760;

drop policy if exists "Usuarios podem ler seus proprios anexos" on storage.objects;
create policy "Usuarios podem ler seus proprios anexos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuarios podem enviar seus proprios anexos" on storage.objects;
create policy "Usuarios podem enviar seus proprios anexos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Usuarios podem excluir seus proprios anexos" on storage.objects;
create policy "Usuarios podem excluir seus proprios anexos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
