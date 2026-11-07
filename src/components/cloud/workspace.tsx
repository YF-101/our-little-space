"use client";
import TrialNotice from "./trial-notice";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudSession as Session } from "@/lib/cloud/session";
import { getCloudClient, getCloudAuth, getSupabaseClient, isDomesticCloud } from "@/lib/cloud/client";
import {
  deletePhoto,
  deleteRows,
  errorText,
  loadSnapshot,
  rpc,
  updateRows,
  uploadPhotos,
} from "@/lib/cloud/api";
import type { CloudMemory, CloudPhoto, CloudSnapshot } from "@/lib/cloud/types";
import {
  daysTogether,
  type Memory,
  type Photo,
  type SpaceData,
} from "@/lib/domain";
import { compressImage } from "@/lib/storage";
import Icon from "../icon";
import Modal from "../modal";
import { MemoryEditor, PhotoUploader } from "../editors";
import { MembershipGate } from "./membership-gate";
import CloudSettings from "./settings";
import { isTemporaryError, initialPhotoCaption } from "@/lib/cloud/reliability";
type Tab = "home" | "timeline" | "photos" | "settings";
const nav = [
  { id: "home" as Tab, label: "我们的小屋", icon: "home" },
  { id: "timeline" as Tab, label: "回忆时间线", icon: "timeline" },
  { id: "photos" as Tab, label: "照片墙", icon: "photo" },
  { id: "settings" as Tab, label: "小屋设置", icon: "settings" },
];
export default function CloudWorkspace({
  session,
  invite,
  clearInvite,
}: {
  session: Session;
  invite: string;
  clearInvite: () => void;
}) {
  const [snapshot, setSnapshot] = useState<CloudSnapshot | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<Tab>("home"),
    [keyword, setKeyword] = useState(""),
    [month, setMonth] = useState(""),
    [sync, setSync] = useState("正在连接"),
    [networkOnline, setNetworkOnline] = useState(true),
    [dark, setDark] = useState(false);
  const [editor, setEditor] = useState<Memory | null | undefined>(undefined),
    [uploader, setUploader] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null),
    [viewer, setViewer] = useState<CloudPhoto | null>(null),
    [confirmation, setConfirmation] = useState<{
      text: string;
      action: () => Promise<void>;
    } | null>(null);
  const alive = useRef(true),
    mutation = useRef(false),
    snapshotRef = useRef<CloudSnapshot | null>(null);
  const loading = useRef<Promise<boolean> | null>(null),
    reloadRequested = useRef(false);
  const uid = session.user.id;
  const refresh = useCallback((): Promise<boolean> => {
    if (loading.current) {
      reloadRequested.current = true;
      return loading.current;
    }
    const run = async () => {
      let ok = false;
      do {
        reloadRequested.current = false;
        try {
          const next = await loadSnapshot();
          if (!alive.current) return false;
          snapshotRef.current = next;
          setSnapshot(next);
          setReady(true);
          setSyncError("");
          ok = true;
        } catch (e) {
          if (!alive.current) return false;
          if (!isTemporaryError(e)) {
            snapshotRef.current = null;
            setSnapshot(null);
          }
          setSyncError(
            isTemporaryError(e) && snapshotRef.current
              ? "暂时无法刷新云端，已保留当前内容和编辑草稿。联网后请重试。"
              : errorText(e),
          );
          setReady(true);
          ok = false;
          reloadRequested.current = false;
        }
      } while (reloadRequested.current && alive.current);
      return ok;
    };
    loading.current = run().finally(() => {
      loading.current = null;
    });
    return loading.current;
  }, []);
  useEffect(() => {
    alive.current = true;
    rpc("ols_ensure_profile")
      .then(() => refresh())
      .catch((e) => {
        if (alive.current) {
          setError(errorText(e));
          setReady(true);
        }
      });
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    try {
      setDark(localStorage.getItem("ols-theme") === "dark");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const sid = snapshot?.space.id;
  useEffect(() => {
    if (!sid) return;
    const db = isDomesticCloud() ? null : getSupabaseClient();
    let disposed = false;
    if (!db) setSync("定时同步 · 每 10 秒更新");
    const channel = db?.channel(`space-${sid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ols_spaces",
          filter: `id=eq.${sid}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe((status) => {
        if (disposed) return;
        setSync(
          status === "SUBSCRIBED"
            ? "实时连接已建立"
            : "实时连接重试中 · 定时刷新兜底",
        );
        if (status === "SUBSCRIBED") void refresh();
      });
    const timer = setInterval(() => {
      void refresh();
    }, isDomesticCloud() ? 10000 : 30000);
    const onFocus = () => {
      void refresh();
    };
    setNetworkOnline(navigator.onLine);
    const onOnline = () => {
      setNetworkOnline(true);
      void refresh();
    };
    const onOffline = () => {
      setNetworkOnline(false);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (db && channel) void db.removeChannel(channel);
    };
  }, [sid, refresh]);
  useEffect(() => {
    if (ready && !snapshot) {
      setDetailId(null);
      setViewer(null);
      setEditor(undefined);
      setUploader(false);
      setConfirmation(null);
    }
  }, [ready, snapshot]);
  // 不在任何持久化缓存中保存云端快照；注销时立即清空界面。
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const result = await getCloudAuth().signOut({ scope: "local" });
      if (result.error) throw result.error;
      setSnapshot(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function mutate(
    task: () => Promise<void>,
    message = "已保存到共享小屋。",
  ) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
      await refresh();
      setToast(message);
      return true;
    } catch (e) {
      setError(errorText(e));
      void refresh();
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function choose(files: FileList | null): Promise<Photo[]> {
    if (!files) return [];
    if (files.length > 6) throw new Error("一次最多选择 6 张照片。");
    const photos: Photo[] = [];
    for (const f of Array.from(files)) {
      photos.push({
        id: crypto.randomUUID(),
        src: await compressImage(f),
        caption: initialPhotoCaption(f.name),
        author: uid,
        date: new Date().toLocaleDateString("sv-SE"),
      });
    }
    return photos;
  }
  function confirm(text: string, action: () => Promise<void>) {
    setConfirmation({ text, action });
  }
  const name = (id: string) =>
    snapshot?.profiles.find((p) => p.id === id)?.nickname ||
    (id === uid ? "我" : "曾经的成员");
  const avatar = (id: string) =>
    snapshot?.photos.find(
      (p) => p.id === snapshot.profiles.find((x) => x.id === id)?.avatar_id,
    )?.src;
  const me = snapshot?.profiles.find((p) => p.id === uid);
  const memories = (snapshot?.memories || []).filter(
    (m) =>
      (!month || m.memory_date.startsWith(month)) &&
      (!keyword.trim() ||
        `${m.title} ${m.body} ${name(m.author_id)}`
          .toLocaleLowerCase()
          .includes(keyword.trim().toLocaleLowerCase())),
  );
  const photos = snapshot?.photos.filter((p) => p.kind === "gallery") || [];
  const modalData: SpaceData = {
    version: 1,
    names: [name(uid), "朋友"],
    welcome: snapshot?.space.welcome || "",
    startDate:
      snapshot?.space.start_date || new Date().toLocaleDateString("sv-SE"),
    memories: [],
    photos: (snapshot?.photos || []).map((p) => ({
      id: p.id,
      src: p.src,
      caption: p.caption,
      author: name(p.author_id),
      date: p.created_at.slice(0, 10),
    })),
  };
  function edit(m: CloudMemory) {
    setDetailId(null);
    setEditor({
      id: m.id,
      title: m.title,
      body: m.body,
      date: m.memory_date,
      author: name(m.author_id),
      photoIds:
        snapshot?.links
          .filter((l) => l.memory_id === m.id)
          .map((l) => l.photo_id) || [],
      reactions: [],
    });
  }
  function card(m: CloudMemory) {
    const p = snapshot?.photos.find((p) =>
      snapshot.links.some((l) => l.memory_id === m.id && l.photo_id === p.id),
    );
    const reactions =
      snapshot?.reactions.filter((r) => r.memory_id === m.id) || [];
    return (
      <article className="memory-card" key={m.id}>
        <button
          className="card-image"
          onClick={() => setDetailId(m.id)}
          aria-label={`打开回忆：${m.title}`}
        >
          {p ? (
            <img src={p.src} alt={p.caption} />
          ) : (
            <div className="no-photo">
              <Icon name="leaf" size={38} />
              <span>文字也有温度</span>
            </div>
          )}
          <span className="date-badge">{m.memory_date}</span>
        </button>
        <div className="card-content">
          <button className="title-button" onClick={() => setDetailId(m.id)}>
            <h3>{m.title}</h3>
          </button>
          <p>{m.body}</p>
          <div className="card-footer">
            <span className="mini-avatar">{name(m.author_id).slice(0, 1)}</span>
            <span>{name(m.author_id)}</span>
            <span className="dot">·</span>
            <span>
              {snapshot?.comments.filter((c) => c.memory_id === m.id).length ||
                0}{" "}
              条留言
            </span>
            <button
              className="reaction"
              onClick={() => setDetailId(m.id)}
              aria-label={`查看互动：${m.title}`}
            >
              🌿 {reactions.length || ""}
            </button>
          </div>
        </div>
      </article>
    );
  }
  const detail = snapshot?.memories.find((m) => m.id === detailId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="home" size={27} />
          </span>
          <span>
            <strong>时光小屋.</strong>
            <small>OUR LITTLE SPACE</small>
          </span>
        </a>
        <div className="sidebar-space">
          <div className="two-avatars">
            {snapshot?.members.map((m) => (
              <span key={m.user_id} className="avatar blue">
                {avatar(m.user_id) ? (
                  <img src={avatar(m.user_id)} alt={name(m.user_id)} />
                ) : (
                  name(m.user_id).slice(0, 1)
                )}
              </span>
            ))}
          </div>
          <strong>
            {snapshot?.members.map((m) => name(m.user_id)).join(" & ") ||
              "你们的私密小屋"}
          </strong>
          <p>两个城市，同一间小屋</p>
        </div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
              key={n.id}
            >
              <Icon name={n.icon} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <Icon name="shield" size={14} />
            云端账号 · 权限保护
          </div>
          <button className="nav-item" onClick={signOut} disabled={busy}>
            退出当前账号
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            我们的空间 <span>/</span>
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-pill">
              {snapshot ? "云端模式" : "云端接入"}
            </span>
            <button
              className="icon-button"
              aria-label="切换主题"
              onClick={() => {
                setDark(!dark);
                try {
                  localStorage.setItem("ols-theme", !dark ? "dark" : "light");
                } catch {}
              }}
            >
              <Icon name="sun" />
            </button>
            <button
              className="account-avatar"
              aria-label="个人设置"
              onClick={() => setTab("settings")}
            >
              {avatar(uid) ? (
                <img src={avatar(uid)} alt="我的头像" />
              ) : (
                me?.nickname.slice(0, 1) || "我"
              )}
            </button>
          </div>
        </header>
        <main className="main-content cloud-main">
          {isDomesticCloud() && <TrialNotice />}
          {(error || syncError) && (
            <div role="alert" className="error-banner">
              {error || syncError}
              <button
                onClick={() => {
                  setError("");
                  setSyncError("");
                }}
                aria-label="关闭错误提示"
              >
                ×
              </button>
            </div>
          )}
          {!ready ? (
            <div className="empty-state">
              <Icon name="leaf" />
              <p>正在安全加载你们的小屋…</p>
            </div>
          ) : !snapshot ? (
            <>
              <div className="cloud-no-access">
                {error || syncError ? (
                  <>
                    <p>未加载私人数据，请检查项目初始化、账号和网络后重试。</p>
                    <button
                      className="secondary-button"
                      onClick={() => void refresh()}
                    >
                      重新加载
                    </button>
                  </>
                ) : (
                  <MembershipGate
                    invite={invite}
                    uid={session.user.id}
                    email={session.user.email || ""}
                    clearInvite={clearInvite}
                    onReady={refresh}
                  />
                )}
                <button className="text-button" onClick={signOut}>
                  退出当前账号
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="cloud-sync" role="status">
                <span
                  className={`sync-dot ${networkOnline && !syncError ? "" : "offline"}`}
                />
                {networkOnline ? sync : "网络已断开 · 请联网后重试"}
                <button onClick={() => void refresh()} disabled={busy}>
                  立即刷新
                </button>
              </div>
              {tab !== "settings" && (
                <section className="page-heading">
                  <div>
                    <div className="eyebrow">
                      OUR LITTLE SPACE · JUST FOR TWO
                    </div>
                    <h1>
                      {tab === "home"
                        ? `欢迎回家，${name(uid)}`
                        : tab === "timeline"
                          ? "回忆时间线"
                          : "照片墙"}
                    </h1>
                    <p>
                      {tab === "home"
                        ? "把平凡的日子，慢慢收藏。"
                        : tab === "timeline"
                          ? "每一页，都有生活的温度。"
                          : "在这里，留住我们看见的世界。"}
                    </p>
                  </div>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      tab === "photos" ? setUploader(true) : setEditor(null)
                    }
                  >
                    <Icon name="plus" size={17} />
                    {tab === "photos" ? "上传照片" : "记录新回忆"}
                  </button>
                </section>
              )}
              {tab === "home" && (
                <>
                  <section className="hero">
                    <img
                      className="hero-background"
                      src="/photos/lake.jpg"
                      alt="湖畔山景装饰图"
                    />
                    <div className="hero-shade" />
                    <div className="hero-copy">
                      <span className="hero-kicker">
                        A LITTLE SPACE, A LOT OF MEMORIES
                      </span>
                      <h2>
                        日子慢慢过，
                        <br />
                        回忆好好存。
                      </h2>
                      <p>{snapshot.space.welcome}</p>
                      <button onClick={() => setTab("timeline")}>
                        翻开我们的故事 <Icon name="arrow" size={18} />
                      </button>
                    </div>
                  </section>
                  <section className="stats">
                    <div className="stat">
                      <span className="stat-icon sky">
                        <Icon name="calendar" />
                      </span>
                      <div>
                        <span>共同记录的日子</span>
                        <strong>
                          {daysTogether(
                            snapshot.space.start_date,
                            new Date().toLocaleDateString("sv-SE"),
                          )}
                          <small>天</small>
                        </strong>
                      </div>
                    </div>
                    <div className="stat">
                      <span className="stat-icon sand">
                        <Icon name="timeline" />
                      </span>
                      <div>
                        <span>珍藏的回忆</span>
                        <strong>
                          {snapshot.memories.length}
                          <small>段</small>
                        </strong>
                      </div>
                    </div>
                    <div className="stat">
                      <span className="stat-icon sage">
                        <Icon name="photo" />
                      </span>
                      <div>
                        <span>留住的瞬间</span>
                        <strong>
                          {photos.length}
                          <small>张</small>
                        </strong>
                      </div>
                    </div>
                  </section>
                  <div className="section-heading">
                    <div>
                      <h2>最近的回忆</h2>
                      <p>另一位成员添加的内容，也会出现在这里。</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setTab("timeline")}
                    >
                      全部回忆 <Icon name="arrow" size={17} />
                    </button>
                  </div>
                  <div className="memory-grid">
                    {snapshot.memories.slice(0, 3).map(card)}
                  </div>
                  {!snapshot.memories.length && (
                    <div className="empty-state">
                      <Icon name="leaf" size={32} />
                      <p>小屋刚刚启程，写下第一段回忆吧。</p>
                      <button
                        className="secondary-button"
                        onClick={() => setEditor(null)}
                      >
                        记录第一段回忆
                      </button>
                    </div>
                  )}
                </>
              )}
              {tab === "timeline" && (
                <>
                  <div className="filter-bar">
                    <label className="search-box">
                      <Icon name="search" />
                      <input
                        aria-label="搜索回忆"
                        placeholder="搜索标题、正文或记录者…"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                      />
                    </label>
                    <label className="month-filter">
                      <Icon name="calendar" />
                      <input
                        type="month"
                        aria-label="按月份筛选"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      />
                    </label>
                    {(keyword || month) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setKeyword("");
                          setMonth("");
                        }}
                      >
                        清除筛选
                      </button>
                    )}
                  </div>
                  <div className="result-label">
                    共 {memories.length} 段回忆 · 日期从近到远
                  </div>
                  <div className="memory-grid timeline-grid">
                    {memories.map(card)}
                  </div>
                  {!memories.length && (
                    <div className="empty-state">
                      还没有匹配的回忆，试试其他条件或写下新的一页。
                    </div>
                  )}
                </>
              )}
              {tab === "photos" && (
                <>
                  <div className="album-note">
                    <Icon name="shield" />
                    <span>私有照片 · 按成员权限访问</span>
                    <small>大图链接有效期 2 分钟，页面自动刷新</small>
                  </div>
                  <div className="photo-wall">
                    {photos.map((p) => (
                      <article className="polaroid" key={p.id}>
                        <button onClick={() => setViewer(p)}>
                          <img
                            src={p.src}
                            alt={p.caption || "回忆照片"}
                            loading="lazy"
                          />
                        </button>
                        <div>
                          <h3>{p.caption || "未命名的瞬间"}</h3>
                          <p>
                            {p.created_at.slice(0, 10)}
                            <span>{name(p.author_id)}</span>
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!photos.length && (
                    <div className="empty-state">
                      <Icon name="photo" size={32} />
                      <p>还没有照片，上传一个生活里的瞬间吧。</p>
                    </div>
                  )}
                </>
              )}
              {tab === "settings" && (
                <CloudSettings
                  snapshot={snapshot}
                  uid={uid}
                  email={session.user.email || ""}
                  busy={busy}
                  mutate={mutate}
                  choose={choose}
                  confirm={confirm}
                  signOut={signOut}
                />
              )}
            </>
          )}
          <footer>
            <span>时光小屋 · Our Little Space</span>
            <span>把平凡的小事，好好记住。</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        {nav.map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "active" : ""}
            onClick={() => setTab(n.id)}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      {editor !== undefined && snapshot && (
        <MemoryEditor
          memory={editor}
          data={modalData}
          storageHint="保存到已授权的云端小屋。"
          busy={busy}
          setBusy={setBusy}
          selectPhotos={choose}
          onError={setError}
          close={() => setEditor(undefined)}
          save={async (m, newPhotos) => {
            const saved = await mutate(async () => {
              const uploaded = await uploadPhotos(
                snapshot.space.id,
                uid,
                newPhotos,
              );
              await rpc("ols_save_memory", {
                s: snapshot.space.id,
                m: m.id,
                t: m.title,
                b: m.body,
                d: m.date,
                photos: [
                  ...m.photoIds.filter(
                    (id) => !newPhotos.some((p) => p.id === id),
                  ),
                  ...uploaded.map((p) => p.id),
                ],
              });
            });
            if (saved) setEditor(undefined);
            return saved;
          }}
        />
      )}
      {uploader && snapshot && (
        <PhotoUploader
          busy={busy}
          setBusy={setBusy}
          selectPhotos={choose}
          close={() => setUploader(false)}
          save={async (list) => {
            const saved = await mutate(async () => {
              await uploadPhotos(snapshot.space.id, uid, list);
            });
            if (saved) setUploader(false);
            return saved;
          }}
        />
      )}
      {detail && snapshot && (
        <Modal title="这一页回忆" close={() => setDetailId(null)} wide>
          <div className="detail-meta">
            {detail.memory_date} · {name(detail.author_id)}记录
          </div>
          <h2 className="detail-title">{detail.title}</h2>
          <p className="detail-body">{detail.body}</p>
          <div className="detail-photos">
            {snapshot.photos
              .filter((p) =>
                snapshot.links.some(
                  (l) => l.memory_id === detail.id && l.photo_id === p.id,
                ),
              )
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setDetailId(null);
                    setViewer(p);
                  }}
                >
                  <img src={p.src} alt={p.caption} />
                </button>
              ))}
          </div>
          <div className="cloud-reactions">
            {["🌿", "☀️", "💛", "🙌"].map((emoji) => {
              const rows = snapshot.reactions.filter(
                (r) => r.memory_id === detail.id && r.emoji === emoji,
              );
              const mine = rows.some((r) => r.author_id === uid);
              return (
                <button
                  key={emoji}
                  disabled={busy}
                  aria-pressed={mine}
                  className={mine ? "selected" : ""}
                  onClick={() =>
                    void mutate(async () => {
                      const db = getCloudClient();
                      const result = mine
                        ? await db
                            .from("ols_reactions")
                            .delete()
                            .eq("memory_id", detail.id)
                            .eq("author_id", uid)
                            .eq("emoji", emoji)
                        : await db.from("ols_reactions").insert({
                            space_id: snapshot.space.id,
                            memory_id: detail.id,
                            emoji,
                          });
                      if (result.error) throw result.error;
                    }, "回应已更新。")
                  }
                >
                  {emoji} {rows.length || ""}
                </button>
              );
            })}
          </div>
          {detail.author_id === uid && (
            <div className="detail-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => edit(detail)}
              >
                <Icon name="edit" size={15} />
                编辑回忆
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => {
                  setDetailId(null);
                  confirm(
                    "删除自己的这段回忆？关联照片仍会保留，评论与回应会一并删除，无法撤销。",
                    async () => {
                      await deleteRows("ols_memories", detail.id);
                    },
                  );
                }}
              >
                <Icon name="trash" size={15} />
                删除回忆
              </button>
            </div>
          )}
          <section className="cloud-comments">
            <h3>这一天的留言</h3>
            {snapshot.comments
              .filter((c) => c.memory_id === detail.id)
              .map((c) => (
                <article key={c.id}>
                  <div>
                    <strong>{name(c.author_id)}</strong>
                    <small>
                      {new Date(c.created_at).toLocaleString("zh-CN")}
                    </small>
                  </div>
                  <p>{c.body}</p>
                  {c.author_id === uid && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setDetailId(null);
                        confirm(
                          "删除自己的这条留言？删除后无法撤销。",
                          async () => {
                            await deleteRows("ols_comments", c.id);
                          },
                        );
                      }}
                    >
                      删除我的留言
                    </button>
                  )}
                </article>
              ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const body = String(new FormData(form).get("body")).trim();
                if (!body) return;
                const ok = await mutate(async () => {
                  const result = await getCloudClient()
                    .from("ols_comments")
                    .insert({
                      space_id: snapshot.space.id,
                      memory_id: detail.id,
                      body,
                    });
                  if (result.error) throw result.error;
                }, "留言已送达小屋。");
                if (ok) form.reset();
              }}
            >
              <label>
                写一句话
                <textarea
                  name="body"
                  rows={3}
                  maxLength={1000}
                  required
                  placeholder="分享一下此刻的心情…"
                />
              </label>
              <button type="submit" className="primary-button" disabled={busy}>
                留下这句话
              </button>
            </form>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </section>
        </Modal>
      )}
      {viewer && snapshot && (
        <Modal title="光影里的瞬间" close={() => setViewer(null)} wide>
          <img
            className="lightbox-image"
            src={
              snapshot.photos.find((p) => p.id === viewer.id)?.src || viewer.src
            }
            alt={viewer.caption}
          />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const caption = String(
                new FormData(e.currentTarget).get("caption"),
              ).trim();
              await mutate(() =>
                updateRows("ols_photos", viewer.id, { caption }),
              );
            }}
          >
            <label>
              照片描述
              <input
                name="caption"
                defaultValue={viewer.caption}
                maxLength={80}
                readOnly={viewer.author_id !== uid}
              />
            </label>
            <div className="detail-actions">
              <span className="muted">
                {name(viewer.author_id)} · {viewer.created_at.slice(0, 10)}
              </span>
              {viewer.author_id === uid && (
                <>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={busy}
                  >
                    保存描述
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy}
                    onClick={() => {
                      setViewer(null);
                      confirm(
                        "删除自己上传的这张照片？它也会从关联回忆中移除，无法撤销。",
                        () => deletePhoto(viewer),
                      );
                    }}
                  >
                    删除照片
                  </button>
                </>
              )}
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="请确认这个操作"
          close={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p className="confirm-text">{confirmation.text}</p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              取消
            </button>
            <button
              className="danger-button solid"
              disabled={busy}
              onClick={async () => {
                if (await mutate(confirmation.action, "操作已完成。"))
                  setConfirmation(null);
              }}
            >
              {busy ? "正在处理…" : "确认"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
