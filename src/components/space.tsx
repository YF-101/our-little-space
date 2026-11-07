"use client";
import { useEffect, useState } from "react";
import Icon from "./icon";
import Modal from "./modal";
import { MemoryEditor, PhotoUploader } from "./editors";
import { demo } from "@/lib/demo";
import {
  daysTogether,
  filterMemories,
  removeMemory,
  removePhoto,
  type Memory,
  type Photo,
  type SpaceData,
} from "@/lib/domain";
import { initialPhotoCaption } from "@/lib/cloud/reliability";
import { compressImage, readSpace, writeSpace } from "@/lib/storage";
type Tab = "home" | "timeline" | "photos" | "settings";
const nav = [
  { id: "home" as Tab, label: "我们的小屋", icon: "home" },
  { id: "timeline" as Tab, label: "回忆时间线", icon: "timeline" },
  { id: "photos" as Tab, label: "照片墙", icon: "photo" },
];
const today = () => new Date().toLocaleDateString("sv-SE");
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
export default function Space() {
  const [data, setData] = useState<SpaceData>(demo),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState<Tab>("home"),
    [keyword, setKeyword] = useState(""),
    [month, setMonth] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [readOnly, setReadOnly] = useState(false),
    [dark, setDark] = useState(false);
  const [editor, setEditor] = useState<Memory | null | undefined>(undefined),
    [upload, setUpload] = useState(false),
    [viewer, setViewer] = useState<Photo | null>(null),
    [detail, setDetail] = useState<Memory | null>(null),
    [remove, setRemove] = useState<{
      type: "memory" | "photo";
      id: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const stored = readSpace();
      if (stored) setData(stored);
      setDark(localStorage.getItem("ols-theme") === "dark");
    } catch {
      setError("无法读取本地存储，已进入只读演示，避免覆盖已有数据。");
      setReadOnly(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  function commit(next: SpaceData) {
    if (readOnly) {
      setError("本地存储不可用，无法保存修改。");
      return false;
    }
    try {
      writeSpace(next);
      setData(next);
      return true;
    } catch {
      setError(
        "保存失败：浏览器空间可能已满。请先导出备份，或减少照片数量后重试。",
      );
      return false;
    }
  }
  const memories = filterMemories(data.memories, keyword, month);
  function changeTab(next: Tab) {
    setTab(next);
    setKeyword("");
    setMonth("");
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `our-little-space-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("已导出本地演示数据（含上传照片）。");
  }
  function toggleReaction(m: Memory) {
    const current = data.memories.find((x) => x.id === m.id);
    if (!current) return;
    commit({
      ...data,
      memories: data.memories.map((x) =>
        x.id === m.id
          ? {
              ...x,
              reactions: x.reactions.includes("🌿")
                ? x.reactions.filter((r) => r !== "🌿")
                : [...x.reactions, "🌿"],
            }
          : x,
      ),
    });
  }
  async function selectPhotos(files: FileList | null): Promise<Photo[]> {
    if (!files) return [];
    if (files.length > 6) throw new Error("一次最多选择 6 张照片。");
    const result: Photo[] = [];
    for (const file of Array.from(files)) {
      result.push({
        id: crypto.randomUUID(),
        src: await compressImage(file),
        caption: initialPhotoCaption(file.name),
        author: data.names[0],
        date: today(),
      });
    }
    return result;
  }
  const renderCard = (m: Memory, index: number) => {
    const photo = data.photos.find((p) => p.id === m.photoIds[0]);
    return (
      <article className="memory-card" key={m.id}>
        <button
          className="card-image"
          onClick={() => setDetail(m)}
          aria-label={`打开回忆：${m.title}`}
        >
          {photo ? (
            <img
              src={photo.src}
              alt={photo.caption}
              loading={index > 2 ? "lazy" : "eager"}
            />
          ) : (
            <div className="no-photo">
              <Icon name="leaf" size={44} />
              <span>文字也有温度</span>
            </div>
          )}
          <span className="date-badge">{dateLabel(m.date)}</span>
          {m.photoIds.length > 1 && (
            <span className="photo-count">
              <Icon name="photo" size={13} />
              {m.photoIds.length}
            </span>
          )}
        </button>
        <div className="card-content">
          <button className="title-button" onClick={() => setDetail(m)}>
            <h3>{m.title}</h3>
          </button>
          <p>{m.body}</p>
          <div className="card-footer">
            <span
              className={`mini-avatar ${m.author === data.names[1] ? "peach" : ""}`}
            >
              {m.author.slice(0, 1)}
            </span>
            <span>{m.author}</span>
            <span className="dot">·</span>
            <span>记录了这一天</span>
            <button
              className={`reaction ${m.reactions.length ? "reacted" : ""}`}
              aria-label={`回应：${m.title}`}
              aria-pressed={m.reactions.length > 0}
              onClick={() => toggleReaction(m)}
            >
              🌿 {m.reactions.length || ""}
            </button>
          </div>
        </div>
      </article>
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeTab("home");
          }}
        >
          <span className="brand-mark">
            <Icon name="home" size={27} />
            <i />
          </span>
          <span>
            <strong>
              时光小屋<span className="brand-dot">.</span>
            </strong>
            <small>OUR LITTLE SPACE</small>
          </span>
        </a>
        <div className="sidebar-space">
          <div className="two-avatars">
            <span className="avatar blue">{data.names[0].slice(0, 1)}</span>
            <span className="avatar peach">{data.names[1].slice(0, 1)}</span>
            <span className="friend-link">✧</span>
          </div>
          <strong>
            {data.names[0]} & {data.names[1]}
          </strong>
          <p>两个城市，同一间小屋</p>
        </div>
        <div className="nav-label">我们的空间</div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              key={n.id}
              onClick={() => changeTab(n.id)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {tab === n.id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" size={24} />
          <p>
            一些小事，
            <br />
            因为有你记得，
            <br />
            就变得很特别。
          </p>
          <span>A LITTLE SPACE, A LOT OF MEMORIES</span>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${tab === "settings" ? "active" : ""}`}
            onClick={() => changeTab("settings")}
          >
            <Icon name="settings" />
            <span>小屋设置</span>
          </button>
          <div className="local-badge">
            <span />
            本地演示 · 未联网同步
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            我们的空间 <span>/</span>{" "}
            <strong>
              {tab === "settings"
                ? "小屋设置"
                : nav.find((n) => n.id === tab)?.label}
            </strong>
          </div>
          <div className="top-actions">
            <span className="demo-pill">DEMO · 本地演示</span>
            <button
              className="icon-button theme-button"
              aria-label={dark ? "切换浅色主题" : "切换深色主题"}
              onClick={() => {
                const next = !dark;
                setDark(next);
                try {
                  localStorage.setItem("ols-theme", next ? "dark" : "light");
                } catch {
                  setToast("主题已切换，但浏览器未能保存主题偏好。");
                }
              }}
            >
              <Icon name="sun" />
            </button>
            <button
              className="account-avatar"
              onClick={() => changeTab("settings")}
              aria-label="个人设置"
            >
              {data.names[0].slice(0, 1)}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" aria-busy={!ready}>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => setError("")} aria-label="关闭错误提示">
                ×
              </button>
            </div>
          )}
          {tab === "home" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">LIFE IS BETTER WHEN SHARED</div>
                  <h1>
                    欢迎回家，{data.names[0]}
                    <span className="greeting-spark">☀</span>
                  </h1>
                  <p>这里装着我们的小日常，和那些不想忘记的瞬间。</p>
                </div>
                <button
                  className="primary-button"
                  disabled={!ready}
                  onClick={() => setEditor(null)}
                >
                  <Icon name="plus" size={18} />
                  记录新回忆
                </button>
              </section>
              <section className="hero">
                <img
                  className="hero-background"
                  src="/photos/lake.jpg"
                  alt="湖畔的山峦与静静停泊的小船"
                />
                <div className="hero-shade" />
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <span /> OUR LITTLE CORNER OF THE WORLD
                  </span>
                  <h2>
                    日子慢慢过，
                    <br />
                    回忆好好存。
                  </h2>
                  <p>{data.welcome}</p>
                  <button onClick={() => changeTab("timeline")}>
                    翻开我们的故事 <Icon name="arrow" size={18} />
                  </button>
                </div>
                <div className="hero-caption">
                  山川湖海，和日常里的我们 <span>↗</span>
                </div>
              </section>
              <section className="stats" aria-label="小屋统计">
                <div className="stat">
                  <span className="stat-icon sky">
                    <Icon name="calendar" size={24} />
                  </span>
                  <div>
                    <span>共同记录的日子</span>
                    <strong>
                      {ready ? daysTogether(data.startDate, today()) : "—"}
                      <small>天</small>
                    </strong>
                  </div>
                  <span className="stat-aside">
                    从 {data.startDate.replaceAll("-", ".")} 开始
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon sand">
                    <Icon name="timeline" size={24} />
                  </span>
                  <div>
                    <span>珍藏的回忆</span>
                    <strong>
                      {data.memories.length}
                      <small>段</small>
                    </strong>
                  </div>
                  <span className="stat-decoration">✧</span>
                </div>
                <div className="stat">
                  <span className="stat-icon sage">
                    <Icon name="photo" size={24} />
                  </span>
                  <div>
                    <span>留住的瞬间</span>
                    <strong>
                      {data.photos.length}
                      <small>张</small>
                    </strong>
                  </div>
                  <span className="stat-decoration">✧</span>
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <div>
                    <h2>
                      最近的回忆 <span className="section-line" />
                    </h2>
                    <p>让平凡的每一天，都有迹可循。</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => changeTab("timeline")}
                  >
                    全部回忆 <Icon name="arrow" size={17} />
                  </button>
                </div>
                <div className="memory-grid">
                  {filterMemories(data.memories, "", "")
                    .slice(0, 3)
                    .map(renderCard)}
                </div>
                {!data.memories.length && (
                  <Empty
                    text="还没有回忆，写下小屋的第一篇故事吧。"
                    action={() => setEditor(null)}
                    label="记录新回忆"
                  />
                )}
              </section>
              <section className="photo-preview-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      光影碎片 <span className="section-line" />
                    </h2>
                    <p>不必特别，也值得按下快门。</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => changeTab("photos")}
                  >
                    走进照片墙 <Icon name="arrow" size={17} />
                  </button>
                </div>
                <div className="photo-strip">
                  {data.photos.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setViewer(p)}
                      aria-label={`查看照片：${p.caption}`}
                    >
                      <img src={p.src} alt={p.caption} loading="lazy" />
                      <span>{p.caption}</span>
                    </button>
                  ))}
                </div>
              </section>
              <div className="closing-note">
                <Icon name="leaf" size={16} />
                <span>不在彼此身边，也在彼此的生活里。</span>
              </div>
            </>
          )}
          {tab === "timeline" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">LITTLE MOMENTS, LASTING STORIES</div>
                  <h1>回忆时间线</h1>
                  <p>把一起走过的日子，一页一页珍藏。</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setEditor(null)}
                >
                  <Icon name="plus" />
                  记录新回忆
                </button>
              </section>
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
                      setMonth("");
                      setKeyword("");
                    }}
                  >
                    清除筛选
                  </button>
                )}
              </div>
              <div className="result-label">
                共 {memories.length} 段回忆 <span>按回忆日期 · 从近到远</span>
              </div>
              <div className="memory-grid timeline-grid">
                {memories.map(renderCard)}
              </div>
              {!memories.length && (
                <Empty
                  text={
                    keyword || month
                      ? "没有找到对应的回忆，试试其他关键词或月份。"
                      : "这里还是空白，第一段回忆由你写下。"
                  }
                  action={() =>
                    keyword || month
                      ? (setKeyword(""), setMonth(""))
                      : setEditor(null)
                  }
                  label={keyword || month ? "清除筛选" : "记录新回忆"}
                />
              )}
            </>
          )}
          {tab === "photos" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">THE WAY WE SEE THE WORLD</div>
                  <h1>
                    照片墙{" "}
                    <span className="heading-count">{data.photos.length}</span>
                  </h1>
                  <p>收藏风景，也收藏生活里的小小美好。</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setUpload(true)}
                >
                  <Icon name="plus" />
                  上传照片
                </button>
              </section>
              <div className="album-note">
                <Icon name="photo" />
                <span>我们的日常相册</span>
                <small>照片仅保存在当前浏览器 · 点击查看大图</small>
              </div>
              <div className="photo-wall">
                {[...data.photos]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((p) => (
                    <article className="polaroid" key={p.id}>
                      <button onClick={() => setViewer(p)}>
                        <img src={p.src} alt={p.caption} loading="lazy" />
                      </button>
                      <div>
                        <h3>{p.caption || "未命名的瞬间"}</h3>
                        <p>
                          {dateLabel(p.date)}
                          <span>{p.author}</span>
                        </p>
                      </div>
                    </article>
                  ))}
              </div>
              {!data.photos.length && (
                <Empty
                  text="上传第一张照片，让这里有一点生活的颜色。"
                  action={() => setUpload(true)}
                  label="上传照片"
                />
              )}
            </>
          )}
          {tab === "settings" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">MAKE YOURSELF AT HOME</div>
                  <h1>小屋设置</h1>
                  <p>让这个小小的地方，更像我们。</p>
                </div>
              </section>
              <div className="settings-layout">
                <form
                  className="settings-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    if (
                      !String(f.get("name1")).trim() ||
                      !String(f.get("name2")).trim() ||
                      !String(f.get("welcome")).trim()
                    ) {
                      setError("昵称和欢迎语不能只包含空格。");
                      return;
                    }
                    if (
                      commit({
                        ...data,
                        names: [
                          String(f.get("name1")).trim(),
                          String(f.get("name2")).trim(),
                        ],
                        welcome: String(f.get("welcome")).trim(),
                        startDate: String(f.get("startDate")),
                      })
                    )
                      setToast("小屋设置已保存在当前浏览器。");
                  }}
                >
                  <h2>小屋的主人</h2>
                  <p className="muted">
                    字母头像会随昵称更新。上传头像将在云端阶段接入。
                  </p>
                  <div className="form-row">
                    <label>
                      你的昵称
                      <input
                        name="name1"
                        defaultValue={data.names[0]}
                        required
                        maxLength={16}
                      />
                    </label>
                    <label>
                      朋友的昵称
                      <input
                        name="name2"
                        defaultValue={data.names[1]}
                        required
                        maxLength={16}
                      />
                    </label>
                  </div>
                  <label>
                    首页欢迎语
                    <textarea
                      name="welcome"
                      defaultValue={data.welcome}
                      required
                      maxLength={100}
                      rows={3}
                    />
                  </label>
                  <label>
                    开始记录的日子
                    <input
                      name="startDate"
                      type="date"
                      required
                      defaultValue={data.startDate}
                      max={today()}
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    保存设置
                  </button>
                </form>
                <div className="settings-stack">
                  <section className="settings-card">
                    <Icon name="shield" />
                    <h2>关于这个演示版</h2>
                    <p>
                      没有登录、云端备份或跨设备同步。两位昵称仅用于展示，不代表两个独立账号。请勿放入敏感私人内容。
                    </p>
                    <span className="status-label">第一阶段 · 本地原型</span>
                  </section>
                  <section className="settings-card">
                    <h2>带走你的小回忆</h2>
                    <p>
                      导出当前浏览器中的 JSON
                      数据，包含文字和上传照片。演示图片以本地资源路径保存；此阶段暂不支持导入。
                    </p>
                    <button className="secondary-button" onClick={exportData}>
                      <Icon name="download" size={17} />
                      导出演示数据
                    </button>
                  </section>
                </div>
              </div>
            </>
          )}
          <a className="demo-cloud-link" href="/cloud">
            准备连接云端小屋 <Icon name="arrow" size={15} />
          </a>
          <footer>
            <span>
              时光小屋 <span className="footer-dot">·</span> Our Little Space
            </span>
            <span>
              为我们，留一方小天地 <Icon name="leaf" size={13} />
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        {[
          ...nav,
          { id: "settings" as Tab, label: "设置", icon: "settings" },
        ].map((n) => (
          <button
            key={n.id}
            className={tab === n.id ? "active" : ""}
            onClick={() => changeTab(n.id)}
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
      {editor !== undefined && (
        <MemoryEditor
          memory={editor}
          data={data}
          busy={busy}
          setBusy={setBusy}
          selectPhotos={selectPhotos}
          onError={setError}
          close={() => setEditor(undefined)}
          save={(m, photos) => {
            if (
              commit({
                ...data,
                photos: [...photos, ...data.photos],
                memories: editor
                  ? data.memories.map((x) => (x.id === m.id ? m : x))
                  : [m, ...data.memories],
              })
            ) {
              setEditor(undefined);
              setToast("回忆已保存在当前浏览器。");
              return true;
            }
            return false;
          }}
        />
      )}
      {upload && (
        <PhotoUploader
          busy={busy}
          setBusy={setBusy}
          selectPhotos={selectPhotos}
          close={() => setUpload(false)}
          save={(photos) => {
            if (commit({ ...data, photos: [...photos, ...data.photos] })) {
              setUpload(false);
              setToast(`已在本地保存 ${photos.length} 张照片。`);
              return true;
            }
            return false;
          }}
        />
      )}
      {detail && (
        <Modal title="这一页回忆" close={() => setDetail(null)} wide>
          <div className="detail-meta">
            {detail.date} · {detail.author}记录
          </div>
          <h2 className="detail-title">{detail.title}</h2>
          <p className="detail-body">{detail.body}</p>
          <div className="detail-photos">
            {detail.photoIds
              .map((id) => data.photos.find((p) => p.id === id))
              .filter((p): p is Photo => !!p)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setViewer(p);
                    setDetail(null);
                  }}
                >
                  <img src={p.src} alt={p.caption} />
                </button>
              ))}
          </div>
          <div className="detail-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setEditor(detail);
                setDetail(null);
              }}
            >
              <Icon name="edit" size={16} />
              编辑回忆
            </button>
            <button
              className="danger-button"
              onClick={() => {
                setRemove({ type: "memory", id: detail.id });
                setDetail(null);
              }}
            >
              <Icon name="trash" size={16} />
              删除回忆
            </button>
          </div>
          <p className="demo-detail">
            本地演示支持编辑全部示例内容。独立账号、作者权限和评论将在第二阶段实现。
          </p>
        </Modal>
      )}
      {viewer && (
        <Modal title="光影里的瞬间" close={() => setViewer(null)} wide>
          <img
            className="lightbox-image"
            src={viewer.src}
            alt={viewer.caption}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const caption = String(
                new FormData(e.currentTarget).get("caption"),
              ).trim();
              if (
                commit({
                  ...data,
                  photos: data.photos.map((p) =>
                    p.id === viewer.id ? { ...p, caption } : p,
                  ),
                })
              ) {
                setViewer({ ...viewer, caption });
                setToast("照片描述已保存。");
              }
            }}
          >
            <label>
              照片描述
              <input
                name="caption"
                defaultValue={viewer.caption}
                maxLength={80}
                placeholder="给这个瞬间写一句话…"
              />
            </label>
            <div className="detail-actions">
              <span className="muted">
                {viewer.date} · {viewer.author}
              </span>
              <button type="submit" className="secondary-button">
                保存描述
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setRemove({ type: "photo", id: viewer.id });
                  setViewer(null);
                }}
              >
                <Icon name="trash" size={16} />
                删除
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal title="删除这个记录？" close={() => setRemove(null)}>
          <p className="confirm-text">
            {remove.type === "photo"
              ? "照片会从本地照片墙和关联回忆中移除。"
              : "只删除这段文字记录，关联照片仍保留在照片墙。"}
            删除后无法撤销。
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setRemove(null)}
            >
              再想想
            </button>
            <button
              className="danger-button solid"
              onClick={() => {
                const next =
                  remove.type === "memory"
                    ? removeMemory(data, remove.id)
                    : removePhoto(data, remove.id);
                if (commit(next)) {
                  setRemove(null);
                  setToast("已从当前浏览器删除。");
                }
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Empty({
  text,
  action,
  label,
}: {
  text: string;
  action: () => void;
  label: string;
}) {
  return (
    <div className="empty-state">
      <Icon name="leaf" size={36} />
      <p>{text}</p>
      <button className="secondary-button" onClick={action}>
        {label}
      </button>
    </div>
  );
}
