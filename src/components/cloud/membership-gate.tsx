"use client";
import { useState } from "react";
import { errorText, rpc } from "@/lib/cloud/api";
import Icon from "../icon";
import { isDomesticCloud } from "@/lib/cloud/client";
import EmailVerification from "./email-verification";
export function MembershipGate({
  invite,
  email,
  uid,
  clearInvite,
  onReady,
}: {
  invite: string;
  email: string;
  uid: string;
  clearInvite: () => void;
  onReady: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(name: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await rpc(name, args);
      clearInvite();
      await onReady();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="membership-gate settings-card">
      <Icon name="home" size={35} />
      <h1>{invite ? "登录成功，请确认加入" : "欢迎，开始你们的小屋"}</h1>
      <p className="muted">当前登录账号：<strong>{email}</strong></p>
      <p>每间小屋最多两位成员，不同小屋的内容相互独立。你可以创建小屋，或通过对方的邀请加入。</p>
      {invite ? (
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => act("ols_accept_invite", { token: invite })}
        >
          {busy ? "正在确认…" : "接受邀请并加入"}
        </button>
      ) : (
        <>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => act("ols_create_space")}
          >
            {busy ? "正在创建…" : "创建我的小屋"}
          </button>
          <p className="muted">
            如果对方已经创建了小屋，请使用对方给你的邀请链接；每个账号同时只能属于一间小屋。
          </p>
        </>
      )}
      {invite && isDomesticCloud() && <EmailVerification uid={uid} email={email} />}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
