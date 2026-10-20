create table public.user_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 5000000),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.user_workspaces enable row level security;
revoke all on public.user_workspaces from anon, authenticated;
grant select, insert, update on public.user_workspaces to authenticated;
create policy workspace_select on public.user_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy workspace_insert on public.user_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workspace_update on public.user_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create function public.workspace_revision() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 new.revision := old.revision + 1;
 new.updated_at := now();
 return new;
end;
$$;
revoke execute on function public.workspace_revision() from public, anon, authenticated;
create trigger workspace_revision before update on public.user_workspaces for each row execute function public.workspace_revision();

-- For projects created with Supabase's automatic RLS event trigger enabled:
-- Applied separately as restrict_automatic_rls_trigger_execution.
-- revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
