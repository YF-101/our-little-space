-- 修复网络重试可能重复新建回忆的问题。保留既有内容与函数访问权限。
begin;
create or replace function public.ols_save_memory(s uuid,m uuid,t text,b text,d date,photos uuid[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not ols_private.is_member(s) then raise exception '没有小屋访问权限';end if;
 if coalesce(array_length(photos,1),0)>12 then raise exception '每段回忆最多 12 张照片';end if;
 if exists(select 1 from unnest(photos) p where not exists(select 1 from public.ols_photos where id=p and space_id=s and author_id=auth.uid() and deleted_at is null and kind='gallery')) then raise exception '照片无效或不属于你';end if;
 -- 同一客户端 UUID 的并发保存通过主键冲突串行处理；其他作者/空间不能覆盖。
 insert into public.ols_memories(id,space_id,author_id,title,body,memory_date)
 values(coalesce(m,gen_random_uuid()),s,auth.uid(),t,b,d)
 on conflict(id) do update set title=excluded.title,body=excluded.body,memory_date=excluded.memory_date,updated_at=now()
 where public.ols_memories.author_id=auth.uid() and public.ols_memories.space_id=s
 returning id into result;
 if result is null then raise exception '只能修改自己的回忆';end if;
 delete from public.ols_memory_photos where memory_id=result;
 insert into public.ols_memory_photos(memory_id,photo_id) select result,p from (select distinct unnest(photos) p) f;
 return result;
end;$$;
commit;
