"use client";
import { useEffect, useState } from "react";
import type { CloudSnapshot } from "@/lib/cloud/types";
import {
  deletePhoto,
  exportSnapshot,
  rpc,
  updateRows,
  uploadPhotos,
} from "@/lib/cloud/api";
import type { Photo } from "@/lib/domain";
import Icon from "../icon";
import { isDomesticCloud } from "@/lib/cloud/client";
import EmailVerification from "./email-verification";
type Props = {
  snapshot: CloudSnapshot;
  uid: string;
  email: string;
  busy: boolean;
  mutate: (task: () => Promise<void>, message?: string) => Promise<boolean>;
  choose: (files: FileList | null) => Promise<Photo[]>;
  confirm: (text: string, action: () => Promise<void>) => void;
  signOut: () => Promise<void>;
};
export default function CloudSettings({
  snapshot,
  uid,
  email,
  busy,
  mutate,
  choose,
  confirm,
  signOut,
}: Props) {
  const me = snapshot.profiles.find((p) => p.id === uid);
  const isOwner = snapshot.space.owner_id === uid;
  const [origin, setOrigin] = useState(""),
    [copied, setCopied] = useState(false),
    [settingsError, setSettingsError] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarPreparing, setAvatarPreparing] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const activeInvite = snapshot.invitations.find(
    (i) =>
      !i.revoked_at && !i.accepted_by && Date.parse(i.expires_at) > Date.now(),
  );
  const link =
    activeInvite && origin
      ? `${origin}/cloud?invite=${encodeURIComponent(activeInvite.id)}`
      : "";
  useEffect(() => {
    setCopied(false);
  }, [link]);
  return (
    <>
      <section className="page-heading">
        <div>
          <div className="eyebrow">MAKE YOURSELF AT HOME</div>
          <h1>小屋设置</h1>
          <p>每个人的账号独立，回忆在同一间小屋相遇。</p>
        </div>
      </section>
      {settingsError && (
        <p className="inline-error" role="alert">
          {settingsError}
        </p>
      )}
      <div className="settings-layout">
        <div className="settings-stack">
          {isDomesticCloud() && <EmailVerification uid={uid} email={email} />}
          <section className="settings-card">
            <h2>我的资料</h2>
            <p>{email}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const nickname = String(
                  new FormData(e.currentTarget).get("nickname"),
                ).trim();
                setSettingsError("");
                if (!nickname) {
                  setSettingsError("昵称不能只包含空格。");
                  return;
                }
                await mutate(() =>
                  updateRows("ols_profiles", uid, { nickname }),
                );
              }}
            >
              <label>
                我的昵称
                <input
                  name="nickname"
                  defaultValue={me?.nickname}
                  required
                  maxLength={16}
                />
              </label>
              <button className="primary-button" disabled={busy}>
                保存昵称
              </button>
            </form>
            <label className="avatar-upload">
              <Icon name="photo" size={18} />
              <span>
                {busy || avatarPreparing ? "处理中…" : "上传我的头像"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || avatarPreparing}
                aria-label="上传我的头像"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const files = input.files;
                  if (!files?.length) return;
                  setAvatarPreparing(true);
                  setAvatarError("");
                  try {
                    const list = await choose(files);
                    if (!list.length) return;
                    if (list.length !== 1) throw new Error("请选择一张头像");
                    await mutate(async () => {
                      const [photo] = await uploadPhotos(
                        snapshot.space.id,
                        uid,
                        list,
                        "avatar",
                      );
                      await updateRows("ols_profiles", uid, {
                        avatar_id: photo.id,
                      });
                      const previous = snapshot.photos.find(
                        (p) => p.id === me?.avatar_id,
                      );
                      if (previous) await deletePhoto(previous);
                    });
                  } catch (error) {
                    setAvatarError((error as Error).message);
                  } finally {
                    input.value = "";
                    setAvatarPreparing(false);
                  }
                }}
              />
            </label>
            {avatarError && (
              <p className="inline-error" role="alert">
                {avatarError}
              </p>
            )}
            <p className="small muted">
              头像会自动压缩为 JPEG，只在当前小屋成员间可见。
            </p>
          </section>
          {isOwner && (
            <form
              className="settings-card"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const welcome = String(f.get("welcome")).trim();
                setSettingsError("");
                if (!welcome) {
                  setSettingsError("欢迎语不能只包含空格。");
                  return;
                }
                await mutate(() =>
                  updateRows("ols_spaces", snapshot.space.id, {
                    welcome,
                    start_date: String(f.get("start_date")),
                  }),
                );
              }}
            >
              <h2>小屋的模样</h2>
              <label>
                首页欢迎语
                <textarea
                  name="welcome"
                  rows={3}
                  required
                  maxLength={100}
                  defaultValue={snapshot.space.welcome}
                />
              </label>
              <label>
                开始记录的日子
                <input
                  type="date"
                  name="start_date"
                  defaultValue={snapshot.space.start_date}
                  max={new Date().toLocaleDateString("sv-SE")}
                  required
                />
              </label>
              <button className="primary-button" disabled={busy}>
                保存小屋设置
              </button>
            </form>
          )}
        </div>
        <div className="settings-stack">
          <section className="settings-card">
            <h2>一起住在小屋的人</h2>
            <div className="cloud-member-list">
              {snapshot.members.map((member) => (
                <div key={member.user_id}>
                  <span className="mini-avatar">
                    {snapshot.profiles
                      .find((p) => p.id === member.user_id)
                      ?.nickname.slice(0, 1) || "友"}
                  </span>
                  <strong>
                    {snapshot.profiles.find((p) => p.id === member.user_id)
                      ?.nickname || "小屋成员"}
                  </strong>
                  <small>
                    {member.user_id === snapshot.space.owner_id
                      ? "管理员"
                      : "成员"}
                  </small>
                  {isOwner && member.user_id !== uid && (
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "撤销这位成员的访问权限？对方将不能继续读取或写入小屋；已下载的副本和短期照片链接无法远程收回。",
                          () =>
                            rpc("ols_revoke_member", {
                              s: snapshot.space.id,
                              member: member.user_id,
                            }),
                        )
                      }
                    >
                      撤销访问
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isOwner && snapshot.members.length < 2 && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const recipient = String(
                    new FormData(e.currentTarget).get("recipient"),
                  ).trim();
                  await mutate(async () => {
                    await rpc<string>("ols_invite", {
                      s: snapshot.space.id,
                      recipient,
                    });
                  }, "邀请已生成，请手动发给对应的朋友。");
                }}
              >
                <label>
                  朋友的登录邮箱
                  <input
                    type="email"
                    name="recipient"
                    required
                    placeholder="friend@example.com"
                  />
                </label>
                <button className="secondary-button" disabled={busy}>
                  生成专属邀请链接
                </button>
                <p className="small muted">
                  有效期 7
                  天，只能由该邮箱的已验证账号接受。不会自动发邮件。重新邀请会撤销旧邀请。
                </p>
              </form>
            )}
            {link && (
              <label className="invite-link">
                复制后发给朋友
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="专属邀请链接"
                />
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(link);
                      setCopied(true);
                    } catch {
                      setSettingsError(
                        "自动复制不可用，请选中邀请链接手动复制。",
                      );
                    }
                  }}
                >
                  {copied ? "已复制邀请链接" : "复制邀请链接"}
                </button>
              </label>
            )}
            {isOwner &&
              snapshot.invitations
                .filter((i) => !i.revoked_at && !i.accepted_by)
                .map((inv) => (
                  <div className="invite-row" key={inv.id}>
                    <span>
                      {inv.email}
                      <small>
                        {new Date(inv.expires_at).toLocaleDateString("zh-CN")}{" "}
                        到期
                      </small>
                    </span>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          "撤销这份尚未接受的邀请？该链接将不能再加入小屋。",
                          async () => {
                            await rpc("ols_revoke_invite", { token: inv.id });
                          },
                        )
                      }
                    >
                      撤销邀请
                    </button>
                  </div>
                ))}
          </section>
          <section className="settings-card">
            <h2>带走你们的回忆</h2>
            <p>
              导出当前获授权的小屋资料、文字、评论、回应和完整照片。文件含私人内容，请妥善保存。此版本暂不支持导入。
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void mutate(
                  () => exportSnapshot(snapshot, uid),
                  "授权数据已导出。",
                )
              }
            >
              <Icon name="download" size={17} />
              {busy ? "处理中…" : "导出授权数据"}
            </button>
          </section>
          <section className="settings-card">
            <Icon name="shield" />
            <h2>私密共享</h2>
            <p>
              每次读取或修改内容时，服务器都会检查登录身份和小屋成员权限。照片链接有效期 2
              分钟。成员权限变化最迟在下次授权刷新时反映到页面。
            </p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={signOut}
            >
              退出当前账号
            </button>
          </section>
        </div>
      </div>
    </>
  );
}
