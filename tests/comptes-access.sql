begin;
insert into auth.users(id,email) values
('10000000-0000-4000-8000-000000000001','rythme-test-a@example.invalid'),
('10000000-0000-4000-8000-000000000002','rythme-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.user_workspaces(user_id,data) values (auth.uid(),'{"goals":[]}');
do $$ begin
 if (select count(*) from public.user_workspaces) <> 1 then raise exception 'owner cannot read'; end if;
 update public.user_workspaces set data='{"goals":[1]}' where user_id=auth.uid() and revision=1;
 if (select revision from public.user_workspaces where user_id=auth.uid()) <> 2 then raise exception 'revision not incremented'; end if;
 update public.user_workspaces set data='{}' where user_id=auth.uid() and revision=1;
 if found then raise exception 'stale revision overwrote data'; end if;
 begin
  update public.user_workspaces set user_id='10000000-0000-4000-8000-000000000002' where user_id=auth.uid();
  raise exception 'owner reassignment allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.user_workspaces) then raise exception 'cross-user read'; end if;
 update public.user_workspaces set data='{}' where user_id='10000000-0000-4000-8000-000000000001';
 if found then raise exception 'cross-user write'; end if;
 begin
  insert into public.user_workspaces(user_id,data) values ('10000000-0000-4000-8000-000000000001','{}');
  raise exception 'cross-user insert';
 exception when insufficient_privilege then null;
 end;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.user_workspaces;
  raise exception 'anonymous access allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
