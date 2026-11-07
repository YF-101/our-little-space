-- 仅在新的 CloudBase PostgreSQL 环境运行。身份按 JWT sub 的文本值存储。
-- 不修改平台 auth 表，不导入旧账号；失败则整体回滚。
-- 不需要 service role；所有应用请求使用用户 JWT，RLS 在 PostgreSQL 强制执行。
begin;
create schema if not exists ols_private;
revoke all on schema ols_private from public, anon;
grant usage on schema ols_private to authenticated;

create table public.ols_profiles (
 id text primary key,
 nickname text not null default '小屋成员' check (length(trim(nickname)) between 1 and 16),
 avatar_id uuid,
 created_at timestamptz not null default now()
);
create table public.ols_spaces (
 id uuid primary key default gen_random_uuid(),
 owner_id text not null unique,
 welcome text not null default '把平凡的日子，收藏成我们的故事。' check(length(trim(welcome)) between 1 and 100),
 start_date date not null default current_date,
 revision bigint not null default 0,
 created_at timestamptz not null default now()
);
create table public.ols_members (
 space_id uuid not null references public.ols_spaces(id),
 user_id text not null references public.ols_profiles(id),
 active boolean not null default true,
 joined_at timestamptz not null default now(),
 primary key(space_id,user_id)
);
create index ols_members_user_idx on public.ols_members(user_id) where active;
create table public.ols_invitations (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.ols_spaces(id),
 email text not null check(email=lower(trim(email)) and length(email) between 3 and 254),
 expires_at timestamptz not null default now()+interval '7 days',
 revoked_at timestamptz,
 accepted_by text,
 created_at timestamptz not null default now()
);
create index ols_invitations_space_idx on public.ols_invitations(space_id);
create table public.ols_memories (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.ols_spaces(id),
 author_id text not null default auth.uid() references public.ols_profiles(id),
 title text not null check(length(trim(title)) between 1 and 60),
 body text not null check(length(trim(body)) between 1 and 5000),
 memory_date date not null default current_date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index ols_memories_space_date_idx on public.ols_memories(space_id,memory_date desc);
create table public.ols_photos (
 id uuid primary key,
 space_id uuid not null references public.ols_spaces(id),
 author_id text not null default auth.uid() references public.ols_profiles(id),
 path text not null unique,
 caption text not null default '' check(length(caption)<=80),
 kind text not null default 'gallery' check(kind in ('gallery','avatar')),
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 constraint ols_photo_path_check check(path=space_id::text||'/'||author_id::text||'/'||id::text||'.jpg'),
 unique(id,space_id)
);
create index ols_photos_space_idx on public.ols_photos(space_id) where deleted_at is null;
alter table public.ols_profiles add constraint ols_avatar_fk foreign key(avatar_id) references public.ols_photos(id);
create table public.ols_memory_photos (
 memory_id uuid not null references public.ols_memories(id) on delete cascade,
 photo_id uuid not null references public.ols_photos(id),
 primary key(memory_id,photo_id)
);
create table public.ols_comments (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.ols_spaces(id),
 memory_id uuid not null references public.ols_memories(id) on delete cascade,
 author_id text not null default auth.uid() references public.ols_profiles(id),
 body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create index ols_comments_space_idx on public.ols_comments(space_id,memory_id);
create table public.ols_reactions (
 space_id uuid not null references public.ols_spaces(id),
 memory_id uuid not null references public.ols_memories(id) on delete cascade,
 author_id text not null default auth.uid() references public.ols_profiles(id),
 emoji text not null check(emoji in ('🌿','☀️','💛','🙌')),
 primary key(memory_id,author_id,emoji)
);
create index ols_reactions_space_idx on public.ols_reactions(space_id);

create function ols_private.is_member(s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ols_members where space_id=s and user_id=(select auth.uid()) and active);
$$;
create function ols_private.is_owner(s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ols_spaces where id=s and owner_id=(select auth.uid())) and ols_private.is_member(s);
$$;
create function ols_private.shared_profile(u text) returns boolean
language sql stable security definer set search_path='' as $$
 select u=(select auth.uid()) or exists(select 1 from public.ols_members a join public.ols_members b on a.space_id=b.space_id where a.user_id=(select auth.uid()) and a.active and b.user_id=u and b.active);
$$;
create function ols_private.can_read_photo(p uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ols_photos where id=p and deleted_at is null and ols_private.is_member(space_id));
$$;
create function ols_private.memory_in_space(m uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ols_memories where id=m and space_id=s);
$$;
revoke all on all functions in schema ols_private from public,anon;
grant execute on all functions in schema ols_private to authenticated;

alter table public.ols_profiles enable row level security;
alter table public.ols_spaces enable row level security;
alter table public.ols_members enable row level security;
alter table public.ols_invitations enable row level security;
alter table public.ols_memories enable row level security;
alter table public.ols_photos enable row level security;
alter table public.ols_memory_photos enable row level security;
alter table public.ols_comments enable row level security;
alter table public.ols_reactions enable row level security;
-- 显式移除默认表授权，只授予下方实际所需的列操作。
revoke all on public.ols_profiles,public.ols_spaces,public.ols_members,public.ols_invitations,public.ols_memories,public.ols_photos,public.ols_memory_photos,public.ols_comments,public.ols_reactions from anon,authenticated;
grant select on public.ols_profiles,public.ols_spaces,public.ols_members,public.ols_invitations,public.ols_memories,public.ols_photos,public.ols_memory_photos,public.ols_comments,public.ols_reactions to authenticated;
grant update(nickname,avatar_id) on public.ols_profiles to authenticated;
grant update(welcome,start_date) on public.ols_spaces to authenticated;
grant insert(id,space_id,path,caption,kind) on public.ols_photos to authenticated;
grant update(caption) on public.ols_photos to authenticated;
grant delete on public.ols_memories to authenticated;
grant insert(space_id,memory_id,body) on public.ols_comments to authenticated;
grant delete on public.ols_comments to authenticated;
grant insert(space_id,memory_id,emoji) on public.ols_reactions to authenticated;
grant delete on public.ols_reactions to authenticated;

create policy profiles_read on public.ols_profiles for select to authenticated using(ols_private.shared_profile(id));
create policy profiles_update on public.ols_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy spaces_read on public.ols_spaces for select to authenticated using(ols_private.is_member(id));
create policy spaces_update on public.ols_spaces for update to authenticated using(ols_private.is_owner(id)) with check(ols_private.is_owner(id));
create policy members_read on public.ols_members for select to authenticated using(ols_private.is_member(space_id));
create policy invitations_read on public.ols_invitations for select to authenticated using(ols_private.is_owner(space_id));
create policy memories_read on public.ols_memories for select to authenticated using(ols_private.is_member(space_id));
create policy memories_delete on public.ols_memories for delete to authenticated using(author_id=auth.uid() and ols_private.is_member(space_id));
create policy photos_read on public.ols_photos for select to authenticated using(deleted_at is null and ols_private.is_member(space_id));
create policy photos_insert on public.ols_photos for insert to authenticated with check(author_id=auth.uid() and ols_private.is_member(space_id));
create policy photos_update on public.ols_photos for update to authenticated using(author_id=auth.uid() and deleted_at is null and ols_private.is_member(space_id)) with check(author_id=auth.uid() and ols_private.is_member(space_id));
create policy links_read on public.ols_memory_photos for select to authenticated using(exists(select 1 from public.ols_memories where id=memory_id and ols_private.is_member(space_id)) and ols_private.can_read_photo(photo_id));
create policy comments_read on public.ols_comments for select to authenticated using(ols_private.is_member(space_id));
create policy comments_insert on public.ols_comments for insert to authenticated with check(author_id=auth.uid() and ols_private.is_member(space_id) and ols_private.memory_in_space(memory_id,space_id));
create policy comments_delete on public.ols_comments for delete to authenticated using(author_id=auth.uid() and ols_private.is_member(space_id));
create policy reactions_read on public.ols_reactions for select to authenticated using(ols_private.is_member(space_id));
create policy reactions_insert on public.ols_reactions for insert to authenticated with check(author_id=auth.uid() and ols_private.is_member(space_id) and ols_private.memory_in_space(memory_id,space_id));
create policy reactions_delete on public.ols_reactions for delete to authenticated using(author_id=auth.uid() and ols_private.is_member(space_id));

create function ols_private.check_avatar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.avatar_id is not null and not exists(select 1 from public.ols_photos where id=new.avatar_id and author_id=new.id and kind='avatar' and deleted_at is null and ols_private.is_member(space_id)) then raise exception '头像无效或没有访问权限';end if;
 return new;
end;$$;
create trigger ols_profile_avatar before update of avatar_id on public.ols_profiles for each row execute function ols_private.check_avatar();

create function public.ols_ensure_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where sub=auth.uid() and email_verified is true) then raise exception '请先登录已验证的账号'; end if;
 insert into public.ols_profiles(id) values(auth.uid()) on conflict(id) do nothing;
end;$$;
create function public.ols_create_space() returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 perform public.ols_ensure_profile();
 -- 同账号并发创建也会串行；成员只能属于一个有效小屋。
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from public.ols_members where user_id=auth.uid() and active) then raise exception '你已经加入一间小屋';end if;
 insert into public.ols_spaces(owner_id) values(auth.uid()) returning id into s;
 insert into public.ols_members(space_id,user_id) values(s,auth.uid());
 return s;
end;$$;
create function public.ols_invite(s uuid,recipient text) returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
 perform 1 from public.ols_spaces where id=s for update;
 if not ols_private.is_owner(s) then raise exception '只有管理员可以邀请';end if;
 if recipient is null or length(trim(recipient))<3 or position('@' in recipient)=0 then raise exception '请填写有效邮箱';end if;
 if lower(trim(recipient))=(select lower(email) from auth.users where sub=auth.uid()) then raise exception '不能邀请自己';end if;
 if (select count(*) from public.ols_members where space_id=s and active)>=2 then raise exception '小屋最多容纳两位成员';end if;
 -- 一次只保留一个有效邀请，防止误邀后旧链接仍有效。
 update public.ols_invitations set revoked_at=now() where space_id=s and revoked_at is null and accepted_by is null;
 insert into public.ols_invitations(space_id,email) values(s,lower(trim(recipient))) returning id into token;
 return token;
end;$$;
create function public.ols_accept_invite(token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.ols_invitations; user_email text;
begin
 perform public.ols_ensure_profile();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select lower(email) into user_email from auth.users where sub=auth.uid() and email_verified is true;
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
create function public.ols_revoke_invite(token uuid) returns void language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 select space_id into s from public.ols_invitations where id=token;
 perform 1 from public.ols_spaces where id=s for update;
 if not ols_private.is_owner(s) then raise exception '只有管理员可以撤销邀请';end if;
 update public.ols_invitations set revoked_at=now() where id=token;
end;$$;
create function public.ols_revoke_member(s uuid,member text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.ols_spaces where id=s for update;
 if not ols_private.is_owner(s) or member=auth.uid() then raise exception '只有管理员可以移除另一位成员';end if;
 update public.ols_members set active=false where space_id=s and user_id=member;
 update public.ols_invitations set revoked_at=now() where space_id=s and revoked_at is null;
end;$$;

-- 内容与附件关系同一事务提交。禁止借附件 ID 链接到其他空间或其他作者的照片。
create function public.ols_save_memory(s uuid,m uuid,t text,b text,d date,photos uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not ols_private.is_member(s) then raise exception '没有小屋访问权限';end if;
 if coalesce(array_length(photos,1),0)>12 then raise exception '每段回忆最多 12 张照片';end if;
 if exists(select 1 from unnest(photos) p where not exists(select 1 from public.ols_photos where id=p and space_id=s and author_id=auth.uid() and deleted_at is null and kind='gallery')) then raise exception '照片无效或不属于你';end if;
 if m is null then
  insert into public.ols_memories(space_id,author_id,title,body,memory_date) values(s,auth.uid(),t,b,d) returning id into result;
 else
  update public.ols_memories set title=t,body=b,memory_date=d,updated_at=now() where id=m and space_id=s and author_id=auth.uid() returning id into result;
  if result is null then raise exception '只能修改自己的回忆';end if;
 end if;
 delete from public.ols_memory_photos where memory_id=result;
 insert into public.ols_memory_photos(memory_id,photo_id) select result,p from (select distinct unnest(photos) p) f;
 return result;
end;$$;


-- 逻辑删除后新行不再符合 SELECT 策略，使用受限 RPC 完成删除事务。
create function public.ols_delete_photo(p uuid) returns void language plpgsql security definer set search_path='' as $$
declare target public.ols_photos;
begin
 select * into target from public.ols_photos where id=p for update;
 if target.id is null or target.author_id<>auth.uid() or not ols_private.is_member(target.space_id) or target.deleted_at is not null then raise exception '照片不存在或没有删除权限';end if;
 update public.ols_profiles set avatar_id=null where id=auth.uid() and avatar_id=p;
 delete from public.ols_memory_photos where photo_id=p;
 update public.ols_photos set deleted_at=now() where id=p;
end;$$;
revoke all on function public.ols_delete_photo(uuid) from public,anon;
grant execute on function public.ols_delete_photo(uuid) to authenticated;

-- 仅广播 revision，不在实时事件中携带私人正文。删除和权限变化也触发 revision。
create function ols_private.touch_space() returns trigger language plpgsql security definer set search_path='' as $$
declare s uuid;
begin
 if tg_table_name='ols_memory_photos' then
  select space_id into s from public.ols_memories where id=coalesce(new.memory_id,old.memory_id);
 else s=coalesce(new.space_id,old.space_id);end if;
 update public.ols_spaces set revision=revision+1 where id=s;
 return null;
end;$$;
create trigger ols_memories_changed after insert or update or delete on public.ols_memories for each row execute function ols_private.touch_space();
create trigger ols_photos_changed after insert or update or delete on public.ols_photos for each row execute function ols_private.touch_space();
create trigger ols_comments_changed after insert or delete on public.ols_comments for each row execute function ols_private.touch_space();
create trigger ols_reactions_changed after insert or delete on public.ols_reactions for each row execute function ols_private.touch_space();
create trigger ols_members_changed after insert or update on public.ols_members for each row execute function ols_private.touch_space();
create trigger ols_links_changed after insert or delete on public.ols_memory_photos for each row execute function ols_private.touch_space();
create function ols_private.profile_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.ols_spaces set revision=revision+1 where id in(select space_id from public.ols_members where user_id=new.id and active);return null;end;$$;
create trigger ols_profiles_changed after update on public.ols_profiles for each row execute function ols_private.profile_changed();

-- 撤销函数默认 PUBLIC 执行权；私有触发器函数不暴露 RPC。
revoke all on function public.ols_ensure_profile(),public.ols_create_space(),public.ols_invite(uuid,text),public.ols_accept_invite(uuid),public.ols_revoke_invite(uuid),public.ols_revoke_member(uuid,text),public.ols_save_memory(uuid,uuid,text,text,date,uuid[]) from public,anon;
grant execute on function public.ols_ensure_profile(),public.ols_create_space(),public.ols_invite(uuid,text),public.ols_accept_invite(uuid),public.ols_revoke_invite(uuid),public.ols_revoke_member(uuid,text),public.ols_save_memory(uuid,uuid,text,text,date,uuid[]) to authenticated;
revoke all on function ols_private.check_avatar(),ols_private.touch_space(),ols_private.profile_changed() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ols-private','ols-private',false,5242880,array['image/jpeg']);
create policy ols_objects_read on storage.objects for select to authenticated using(bucket_id='ols-private' and (exists(select 1 from public.ols_photos p where p.path=name and p.deleted_at is null and ols_private.is_member(p.space_id)) or ((storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.ols_members where space_id::text=(storage.foldername(name))[1] and user_id=auth.uid() and active))));
create policy ols_objects_insert on storage.objects for insert to authenticated with check(bucket_id='ols-private' and array_length(storage.foldername(name),1)=2 and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.ols_members where space_id::text=(storage.foldername(name))[1] and user_id=auth.uid() and active));
create policy ols_objects_delete on storage.objects for delete to authenticated using(bucket_id='ols-private' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.ols_members where space_id::text=(storage.foldername(name))[1] and user_id=auth.uid() and active));
-- Realtime 仅发布小屋行；RLS 控制订阅可见性，30 秒轮询兜底处理撤权/断线。
-- CloudBase PG 无 Supabase Realtime；由客户端轮询并重新执行 RLS。
commit;
