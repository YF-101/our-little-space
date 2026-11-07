"use client";
import { useEffect, useState } from "react";
import { beginDomesticEmailVerification } from "@/lib/cloud/domestic";
import { errorText } from "@/lib/cloud/api";

export default function EmailVerification({ uid, email }: { uid: string; email: string }) {
 const [verify, setVerify] = useState<((code: string) => Promise<void>) | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [message, setMessage] = useState("");
 const [remaining, setRemaining] = useState(0);
 const [code, setCode] = useState("");
 useEffect(() => {
  if (!remaining) return;
  const timer = window.setTimeout(() => setRemaining(Math.max(0, remaining - 1)), 1000);
  return () => window.clearTimeout(timer);
 }, [remaining]);
 useEffect(() => { setVerify(null); setCode(""); setError(""); setMessage(""); setRemaining(0); }, [uid, email]);
 return <section className="settings-card" aria-label="验证账号邮箱">
  <h2>验证账号邮箱</h2>
  <p>接受朋友的邀请前，请先验证当前账号的邮箱。验证后再点击“接受邀请并加入”。</p>
  <p className="muted">当前邮箱：{email || "尚未配置邮箱"}</p>
  <button type="button" className="secondary-button" disabled={busy || remaining > 0 || !email} onClick={async () => {
   setBusy(true); setError(""); setMessage("");
   try {
    const next = await beginDomesticEmailVerification(uid);
    setVerify(() => next); setCode(""); setRemaining(60);
    setMessage("验证码已发送，请查看邮箱和垃圾邮件。刷新页面后需要重新发送。");
   } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }}>{busy ? "正在处理…" : remaining ? `${remaining} 秒后可重发` : verify ? "重新发送验证码" : "发送邮箱验证码"}</button>
  {verify && <form onSubmit={async e => {
   e.preventDefault(); setBusy(true); setError("");
   try { await verify(code); setVerify(null); setCode(""); setMessage("邮箱验证已完成，可以重新尝试接受邀请。加入权限仍由服务器确认。"); }
   catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }}>
   <label>邮件验证码<input name="verification-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required value={code} onChange={e=>setCode(e.target.value)} /></label>
   <button className="primary-button" disabled={busy}>{busy ? "正在验证…" : "确认邮箱验证码"}</button>
  </form>}
  {message && <p role="status" className="small muted">{message}</p>}
  {error && <p role="alert" className="inline-error">{error}</p>}
  <p className="small muted">邮件发送失败时，请联系管理员检查云开发邮件服务。验证码只在当前页面提交给账号服务。</p>
 </section>;
}
