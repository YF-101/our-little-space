# 自行部署

## CloudBase 国内环境

1. 使用自己的腾讯云账号创建上海 PostgreSQL 云开发环境，核实当前价格和有效期，不要复制维护者的环境 ID。
2. 在该环境 SQL 编辑器中按顺序执行 `cloudbase/migrations/*.sql`。迁移面向 CloudBase PostgreSQL 身份表及私有 Storage，执行前在新环境验证。
3. 在身份认证中启用用户名密码和邮箱验证码，配置内置发件服务或自己的 SMTP；按平台要求配置允许的应用来源。不要开启匿名登录。
4. 本机 `.env.local` 填写 `NEXT_PUBLIC_CLOUDBASE_ENV_ID`，不填 SecretId、SecretKey 或服务端凭据；不要同时配置旧 Supabase 环境。
5. 运行 `npm run build:domestic-preview`，将 `out/` 的静态产物部署到自己环境的静态网站托管。设置变量后必须重新构建。
6. 按平台要求配置 HTTPS、缓存及响应安全头，实测注册、验证码、建屋、双账号邀请、私有图片、非成员隔离与撤权，然后再邀请用户。

## Supabase + Vercel

1. 创建自己的 Supabase 项目，按顺序执行 `supabase/migrations/*.sql`，启用合适的邮箱认证与邮件投递。
2. 配置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（仅 `sb_publishable_` 开头的客户端公开密钥），留空国内环境 ID。
3. `npm run build` 后在自己的 Vercel 项目部署。Supabase 路径当前提供登录和共享，公开注册 UI 的最新实现针对 CloudBase；自行调整认证前先做独立验收。

私人数据由数据库 RLS、成员表和私有存储策略保护，不能仅靠隐藏页面。不要上传 `.env.local`、数据库导出或用户照片。数据库备份、用量监控、服务到期续期与用户运营由部署者负责。
