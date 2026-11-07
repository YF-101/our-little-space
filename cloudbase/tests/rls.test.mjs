// 使用嵌入式 PostgreSQL 验证真实 SQL/RLS。Auth 和 Storage 控制面以最小表模拟；
// 不代替连接真实 Supabase 后的 Auth、Storage API、Realtime 与并发验收。
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("CloudBase text identity and authorization boundaries", async (t) => {
  const db = await PGlite.create();
  try {
    await db.exec(`
 create role anon nologin;create role authenticated nologin;
 create schema auth;create table auth.users(id bigint generated always as identity primary key,sub text,email text,email_verified boolean);
 create function auth.uid() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 create publication supabase_realtime;
 insert into auth.users(sub,email,email_verified) values
 ('2118537290455220225','owner@example.test',true),
 ('2118537290455220226','friend@example.test',true),
 ('2118537290455220227','stranger@example.test',true),
 ('2118537290455220228','unconfirmed@example.test',false);
 `);
    const migrationDir = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(migrationDir))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      await db.exec(await readFile(new URL(name, migrationDir), "utf8"));
    }
    const owner = "2118537290455220225",
      friend = "2118537290455220226",
      stranger = "2118537290455220227";
    async function user(id) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      await db.exec("set role authenticated");
    }
    async function scalar(q, p = []) {
      return (await db.query(q, p)).rows[0]?.value;
    }
    await t.test("password account without verified email provisions only its own profile", async () => {
      await user("2118537290455220228");
      await assert.doesNotReject(() => db.query("select public.ols_ensure_profile()"));
      assert.equal((await db.query("select * from public.ols_profiles")).rows.length, 1);
      assert.equal((await db.query("select * from public.ols_spaces")).rows.length, 0);
    });
    await user(owner);
    await db.query("select public.ols_ensure_profile()");
    const sid = await scalar("select public.ols_create_space() as value");
    const mid = await scalar(
      "select public.ols_save_memory($1,null,'只有两人看得到','私人测试正文','2026-11-05','{}') as value",
      [sid],
    );
    await t.test("unverified email cannot accept a matching invitation", async () => {
      await user(owner);
      const token = await scalar("select public.ols_invite($1,'unconfirmed@example.test') as value", [sid]);
      await user("2118537290455220228");
      await assert.rejects(() => db.query("select public.ols_accept_invite($1)", [token]), /验证邮箱/);
      assert.equal((await db.query("select * from public.ols_spaces")).rows.length, 0);
      await user(owner);
      await db.query("select public.ols_revoke_invite($1)", [token]);
    });
    await t.test(
      "same client UUID safely retries creation without duplicate rows",
      async () => {
        const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
        await db.query(
          "select public.ols_save_memory($1,$2,'重试','第一版',current_date,'{}')",
          [sid, id],
        );
        await db.query(
          "select public.ols_save_memory($1,$2,'重试','第二版',current_date,'{}')",
          [sid, id],
        );
        const rows = (
          await db.query("select body from public.ols_memories where id=$1", [
            id,
          ])
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].body, "第二版");
        await db.query("delete from public.ols_memories where id=$1", [id]);
      },
    );
    await t.test("one account cannot create another active space", async () => {
      await assert.rejects(
        () => db.query("select public.ols_create_space()"),
        /已经加入/,
      );
    });
    await t.test(
      "anonymous role cannot read private tables or run RPC",
      async () => {
        await db.exec("set role anon");
        await assert.rejects(
          () => db.query("select * from public.ols_memories"),
          /permission denied/,
        );
        await assert.rejects(
          () => db.query("select public.ols_create_space()"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "uninvited authenticated user sees no space, content or profiles of others",
      async () => {
        await user(stranger);
        await db.query("select public.ols_ensure_profile()");
        assert.equal(
          (await db.query("select * from public.ols_spaces")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.ols_memories")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from public.ols_profiles")).rows.length,
          1,
        );
        await assert.rejects(
          () =>
            db.query(
              "select public.ols_save_memory($1,null,'x','y',current_date,'{}')",
              [sid],
            ),
          /访问权限/,
        );
      },
    );
    await user(owner);
    const expiredToken = await scalar(
      "select public.ols_invite($1,$2) as value",
      [sid, "stranger@example.test"],
    );
    await db.exec("reset role");
    await db.query(
      "update public.ols_invitations set expires_at=now()-interval '1 day' where id=$1",
      [expiredToken],
    );
    await t.test(
      "expired and explicitly revoked invitations cannot be accepted",
      async () => {
        await user(stranger);
        await assert.rejects(
          () => db.query("select public.ols_accept_invite($1)", [expiredToken]),
          /邀请无效/,
        );
        await user(owner);
        const revoked = await scalar(
          "select public.ols_invite($1,$2) as value",
          [sid, "stranger@example.test"],
        );
        await db.query("select public.ols_revoke_invite($1)", [revoked]);
        await user(stranger);
        await assert.rejects(
          () => db.query("select public.ols_accept_invite($1)", [revoked]),
          /邀请无效/,
        );
      },
    );
    await user(owner);
    const oldToken = await scalar("select public.ols_invite($1,$2) as value", [
      sid,
      "stranger@example.test",
    ]);
    const token = await scalar("select public.ols_invite($1,$2) as value", [
      sid,
      "friend@example.test",
    ]);
    await t.test(
      "replacement invalidates previous invite and email must match",
      async () => {
        await user(stranger);
        await assert.rejects(
          () => db.query("select public.ols_accept_invite($1)", [oldToken]),
          /邀请无效/,
        );
        await assert.rejects(
          () => db.query("select public.ols_accept_invite($1)", [token]),
          /邮箱不匹配/,
        );
      },
    );
    await user(friend);
    await db.query("select public.ols_accept_invite($1)", [token]);
    await t.test(
      "invited member reads shared content but cannot manage members",
      async () => {
        assert.equal(
          (await db.query("select * from public.ols_memories")).rows.length,
          1,
        );
        assert.equal(
          (await db.query("select * from public.ols_invitations")).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query("select public.ols_revoke_member($1,$2)", [sid, owner]),
          /管理员/,
        );
        await assert.rejects(
          () =>
            db.query(
              "insert into public.ols_members(space_id,user_id) values($1,$2)",
              [sid, stranger],
            ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "member cannot edit, delete, or reassign another author record",
      async () => {
        await assert.rejects(
          () =>
            db.query(
              "select public.ols_save_memory($1,$2,'篡改','篡改',current_date,'{}')",
              [sid, mid],
            ),
          /自己的回忆/,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.ols_memories where id=$1 returning id",
              [mid],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query(
              "update public.ols_memories set author_id=$1 where id=$2",
              [friend, mid],
            ),
          /permission denied/,
        );
      },
    );
    await t.test(
      "member can create and read a comment, owner cannot delete that comment",
      async () => {
        const cid = await scalar(
          "insert into public.ols_comments(space_id,memory_id,body) values($1,$2,'朋友的留言') returning id as value",
          [sid, mid],
        );
        await user(owner);
        assert.equal(
          (await db.query("select * from public.ols_comments")).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.ols_comments where id=$1 returning id",
              [cid],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "space full rejects a third member and invite replay fails",
      async () => {
        await assert.rejects(
          () =>
            db.query("select public.ols_invite($1,$2)", [
              sid,
              "stranger@example.test",
            ]),
          /最多容纳两位/,
        );
        await user(friend);
        await assert.rejects(
          () => db.query("select public.ols_accept_invite($1)", [token]),
          /邀请无效/,
        );
      },
    );
    const pid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      path = `${sid}/${owner}/${pid}.jpg`;
    await t.test(
      "private bucket, path owner and photo access enforced",
      async () => {
        await user(owner);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('ols-private',$1)",
          [path],
        );
        await db.query(
          "insert into public.ols_photos(id,space_id,path) values($1,$2,$3)",
          [pid, sid, path],
        );
        await user(friend);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          1,
        );
        await assert.rejects(
          () =>
            db.query(
              "insert into storage.objects(bucket_id,name) values('ols-private',$1)",
              [`${sid}/${owner}/forged.jpg`],
            ),
          /row-level security/,
        );
        assert.equal(
          (
            await db.query(
              "update public.ols_photos set caption=$1 where id=$2 returning id",
              ["篡改", pid],
            )
          ).rows.length,
          0,
        );
        await user(stranger);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
      },
    );
    await t.test(
      "owner can save attachments transactionally and partner can react",
      async () => {
        await user(owner);
        await db.query(
          "select public.ols_save_memory($1,$2,'更新标题','更新正文',current_date,$3)",
          [sid, mid, [pid, pid]],
        );
        assert.equal(
          (await db.query("select * from public.ols_memory_photos")).rows
            .length,
          1,
        );
        await user(friend);
        assert.equal(
          (await db.query("select * from public.ols_memory_photos")).rows
            .length,
          1,
        );
        await assert.rejects(
          () => db.query("select public.ols_delete_photo($1)", [pid]),
          /删除权限/,
        );
        await assert.rejects(
          () =>
            db.query(
              "select public.ols_save_memory($1,null,'x','y',current_date,$2)",
              [sid, [pid]],
            ),
          /照片无效/,
        );
        await db.query(
          "insert into public.ols_reactions(space_id,memory_id,emoji) values($1,$2,'🌿')",
          [sid, mid],
        );
        await user(owner);
        assert.equal(
          (
            await db.query(
              "delete from public.ols_reactions where memory_id=$1 returning memory_id",
              [mid],
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test("cross-space attachments and comments denied", async () => {
      await user(stranger);
      const other = await scalar("select public.ols_create_space() as value");
      await assert.rejects(
        () =>
          db.query(
            "select public.ols_save_memory($1,null,'x','y',current_date,$2) as value",
            [other, [pid]],
          ),
        /照片无效/,
      );
      await assert.rejects(
        () =>
          db.query(
            "insert into public.ols_comments(space_id,memory_id,body) values($1,$2,'越权')",
            [other, mid],
          ),
        /row-level security/,
      );
    });
    await t.test(
      "profile ownership and avatar validation are enforced",
      async () => {
        await user(friend);
        assert.equal(
          (
            await db.query(
              "update public.ols_profiles set nickname=$1 where id=$2 returning id",
              ["被篡改", owner],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query(
              "update public.ols_profiles set avatar_id=$1 where id=$2",
              [pid, friend],
            ),
          /头像无效/,
        );
      },
    );
    await t.test(
      "soft-deleted photo is invisible to partner and storage can be cleaned by owner",
      async () => {
        await user(owner);
        await db.query("select public.ols_delete_photo($1)", [pid]);
        await user(friend);
        assert.equal(
          (await db.query("select * from public.ols_photos")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        await user(owner);
        assert.equal(
          (await db.query("delete from storage.objects returning id")).rows
            .length,
          1,
        );
      },
    );
    await user(owner);
    const remainingPhoto = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const remainingPath = `${sid}/${owner}/${remainingPhoto}.jpg`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('ols-private',$1)",
      [remainingPath],
    );
    await db.query(
      "insert into public.ols_photos(id,space_id,path) values($1,$2,$3)",
      [remainingPhoto, sid, remainingPath],
    );
    await t.test(
      "revoked user immediately loses DB and private storage read/write access",
      async () => {
        await user(owner);
        await db.query("select public.ols_revoke_member($1,$2)", [sid, friend]);
        await user(friend);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        for (const table of [
          "ols_spaces",
          "ols_memories",
          "ols_members",
          "ols_comments",
          "ols_reactions",
          "ols_photos",
        ])
          assert.equal(
            (await db.query(`select * from public.${table}`)).rows.length,
            0,
          );
        await assert.rejects(
          () =>
            db.query(
              "insert into public.ols_comments(space_id,memory_id,body) values($1,$2,'不能再发')",
              [sid, mid],
            ),
          /row-level security/,
        );
      },
    );
    await db.exec("reset role");
    assert.equal(
      await scalar(
        "select public as value from storage.buckets where id='ols-private'",
      ),
      false,
    );
  } finally {
    await db.close();
  }
});
