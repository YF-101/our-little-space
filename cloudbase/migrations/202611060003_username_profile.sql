-- 国内用户名密码账号可初始化自己的资料；共享邀请仍要求已验证邮箱。
-- 保留已有函数 GRANT 和所有表 RLS，不给非成员授予共享数据访问权。
begin;
create or replace function public.ols_ensure_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where sub=auth.uid()) then raise exception '请先登录有效账号';end if;
 insert into public.ols_profiles(id) values(auth.uid()) on conflict(id) do nothing;
end;$$;
create or replace function public.ols_accept_invite(token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.ols_invitations; user_email text;
begin
 perform public.ols_ensure_profile();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select lower(email) into user_email from auth.users where sub=auth.uid() and email_verified is true;
 if user_email is null then raise exception '请先验证邮箱再接受共享邀请';end if;
 select * into inv from public.ols_invitations where id=token;
 if inv.id is null then raise exception '邀请不可用';end if;
 -- 所有邀请/接受/撤销都先锁同一间小屋，避免超员和撤销竞态。
 perform 1 from public.ols_spaces where id=inv.space_id for update;
 select * into inv from public.ols_invitations where id=token for update;
 if inv.revoked_at is not null or inv.accepted_by is not null or inv.expires_at<=now() or inv.email<>user_email then raise exception '邀请无效、已过期，或与当前账号邮箱不匹配';end if;
 if exists(select 1 from public.ols_members where user_id=auth.uid() and active) then raise exception '你已经加入一间小屋';end if;
 if (select count(*) from public.ols_members where space_id=inv.space_id and active)>=2 then raise exception '小屋已满';end if;
 insert into public.ols_members(space_id,user_id) values(inv.space_id,auth.uid()) on conflict(space_id,user_id) do update set active=true,joined_at=now();
 update public.ols_invitations set accepted_by=auth.uid() where id=token;
 return inv.space_id;
end;$$;
commit;
