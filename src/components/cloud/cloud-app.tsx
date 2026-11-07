"use client";
import TrialNotice from "./trial-notice";
import { useEffect, useState } from "react";
import type { CloudSession as Session } from "@/lib/cloud/session";
import { cloudConfigured, getCloudAuth, isDomesticCloud } from "@/lib/cloud/client";
import { errorText } from "@/lib/cloud/api";
import CloudWorkspace from "./workspace";
import Icon from "../icon";
import InviteRegistration from "./invite-registration";
export default function CloudApp() {
  const [register, setRegister] = useState(false);
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState("");
  useEffect(() => {
    setInvite(new URL(window.location.href).searchParams.get("invite") || "");
    if (!cloudConfigured()) {
      setReady(true);
      return;
    }
    try {
      const auth = getCloudAuth();
      let alive = true;
      auth
        .getSession()
        .then(({ data, error }) => {
          if (alive) {
            if (error) setError(errorText(error));
            setSession(data.session);
            setReady(true);
          }
        })
        .catch((e) => {
          if (alive) {
            setError(errorText(e));
            setReady(true);
          }
        });
      const { data: listener } = auth.onAuthStateChange((_event, next) => {
        if (alive) {
          setSession(next);
          setReady(true);
        }
      });
      return () => {
        alive = false;
        listener.subscription.unsubscribe();
      };
    } catch (e) {
      setError(errorText(e));
      setReady(true);
    }
  }, []);
  if (session)
    return (
      <CloudWorkspace
        key={session.user.id}
        session={session}
        invite={invite}
        clearInvite={() => {
          setInvite("");
          window.history.replaceState(null, "", window.location.pathname);
        }}
      />
    );
  return (
    <div className="cloud-entry">
      <div className="cloud-entry-art">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="home" size={32} />
          </span>
          <span>
            <strong>时光小屋.</strong>
            <small>OUR LITTLE SPACE</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">A LITTLE SPACE, JUST FOR TWO</span>
          <h1>
            两个城市，
            <br />
            同一间小屋。
          </h1>
          <p>
            把日常写成信，把照片留成诗。
            <br />
            这里的回忆，只与你们分享。
          </p>
        </div>
        <small>与朋友，一起好好收藏生活。</small>
      </div>
      <main className="cloud-entry-form">
        <div className="cloud-login-card">
          {isDomesticCloud() && <TrialNotice />}
          <span className="status-label">
            <Icon name="shield" size={14} />{" "}
            {cloudConfigured() ? "私密共享空间" : "云端接入 · 待配置"}
          </span>
          <h2>
            {cloudConfigured() ? "欢迎回到小屋" : "下一步，连接你们的小屋"}
          </h2>
          {!cloudConfigured() ? (
            <>
              <p>
                云端代码已准备好。创建 Supabase 项目后，按项目中的{" "}
                <strong>SUPABASE_SETUP.md</strong>{" "}
                完成数据库初始化和本机环境变量配置。
              </p>
              <ol>
                <li>创建 Supabase 项目。</li>
                <li>运行数据库初始化 SQL。</li>
                <li>创建你和朋友的独立账号。</li>
                <li>填写 .env.local 并重启项目。</li>
              </ol>
              <p>尚未连接数据库，当前页面不会保存私人内容。</p>
              <a className="secondary-button" href="/demo">
                继续体验本地演示 <Icon name="arrow" size={16} />
              </a>
            </>
          ) : register && isDomesticCloud() ? (
            <InviteRegistration invite={invite} onBack={() => setRegister(false)} />
          ) : (
            <>
              <p>
                {invite
                  ? "请用被邀请的邮箱登录，再确认加入小屋。"
                  : "登录或注册你的独立账号，和另一人拥有一间私密小屋。"}
              </p>
              {isDomesticCloud() && <button className="secondary-button" disabled={!ready || busy} onClick={() => setRegister(true)}>{invite ? "第一次来？通过邀请注册" : "第一次来？注册并创建小屋"}</button>}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy || !ready) return;
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    const result =
                      await getCloudAuth().signInWithPassword({
                        email: String(f.get("email")).trim(),
                        password: String(f.get("password")),
                      });
                    if (result.error) throw result.error;
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {isDomesticCloud() ? "用户名或邮箱" : "邮箱"}
                  <input
                    type={isDomesticCloud() ? "text" : "email"}
                    name="email"
                    autoComplete="username"
                    required
                    placeholder={isDomesticCloud() ? "用户名或邮箱地址" : "you@example.com"}
                  />
                </label>
                <label>
                  密码
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="你的账号密码"
                  />
                </label>
                {error && (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="primary-button"
                  disabled={busy || !ready}
                  type="submit"
                >
                  {busy
                    ? "正在登录…"
                    : !ready
                      ? "正在检查登录状态…"
                      : "进入时光小屋"}
                  <Icon name="arrow" size={16} />
                </button>
              </form>
              <p className="small muted">
                无法登录或忘记密码时，请联系小屋管理员。新用户可以注册；已有小屋的另一位成员请通过邀请链接加入。
              </p>
              <a className="text-button" href="/demo">
                查看本地演示
              </a>
            </>
          )}
          {!cloudConfigured() && error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
