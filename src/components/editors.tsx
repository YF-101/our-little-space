"use client";
import { useRef, useState } from "react";
import type { Memory, Photo, SpaceData } from "@/lib/domain";
import Icon from "./icon";
import Modal from "./modal";
const today = () => new Date().toLocaleDateString("sv-SE");
export function MemoryEditor({
  memory,
  data,
  busy,
  setBusy,
  selectPhotos,
  onError,
  close,
  save,
  storageHint = "仅保存到本浏览器。",
}: {
  storageHint?: string;
  memory: Memory | null;
  data: SpaceData;
  busy: boolean;
  setBusy: (v: boolean) => void;
  selectPhotos: (f: FileList | null) => Promise<Photo[]>;
  onError: (s: string) => void;
  close: () => void;
  save: (m: Memory, p: Photo[]) => boolean | Promise<boolean>;
}) {
  const memoryId = useRef(memory?.id || crypto.randomUUID());
  const [photos, setPhotos] = useState<Photo[]>([]),
    [localError, setLocalError] = useState(""),
    [attached, setAttached] = useState(memory?.photoIds || []);
  return (
    <Modal
      title={memory ? "编辑这一页回忆" : "记录一个小日常"}
      busy={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          setLocalError("");
          const title = String(f.get("title")).trim(),
            body = String(f.get("body")).trim();
          if (!title || !body) {
            setLocalError("标题和正文不能只包含空格。");
            return;
          }
          onError("");
          const saved = await save(
            {
              id: memoryId.current,
              title,
              body,
              date: String(f.get("date")),
              author: memory?.author || data.names[0],
              photoIds: [...attached, ...photos.map((p) => p.id)],
              reactions: memory?.reactions || [],
            },
            photos,
          );
          if (!saved)
            setLocalError("保存失败，请检查网络、访问权限或存储空间后重试。");
        }}
      >
        <fieldset disabled={busy}>
          <label>
            回忆标题
            <input
              name="title"
              data-autofocus
              defaultValue={memory?.title}
              autoFocus
              required
              maxLength={60}
              placeholder="给这一天起个名字…"
            />
          </label>
          <label>
            发生的日子
            <input
              type="date"
              name="date"
              defaultValue={memory?.date || today()}
              required
            />
          </label>
          <label>
            想记住的事
            <textarea
              name="body"
              defaultValue={memory?.body}
              required
              maxLength={5000}
              rows={5}
              placeholder="天气、心情，或是那天说过的一句话…"
            />
          </label>
          <label className="upload-zone">
            <Icon name="photo" />
            <strong>{busy ? "正在处理照片…" : "为回忆加几张照片"}</strong>
            <span>最多 6 张 · JPG / PNG / WebP · 自动压缩</span>
            <input
              aria-label="选择回忆照片"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={async (e) => {
                const input = e.currentTarget;
                const files = input.files;
                if (!files?.length) return;
                setBusy(true);
                setLocalError("");
                try {
                  const selected = await selectPhotos(files);
                  if (selected.length + attached.length > 12)
                    throw new Error(
                      "每段回忆最多关联 12 张照片，请先移除部分附件。",
                    );
                  setPhotos(selected);
                } catch (err) {
                  setLocalError((err as Error).message);
                } finally {
                  input.value = "";
                  setBusy(false);
                }
              }}
            />
          </label>
          <div className="attachment-list">
            {attached.map((id) => {
              const p = data.photos.find((x) => x.id === id);
              return p ? (
                <button
                  type="button"
                  key={id}
                  onClick={() => setAttached(attached.filter((x) => x !== id))}
                  aria-label={`移除附件 ${p.caption}`}
                >
                  <img src={p.src} alt={p.caption} />
                  <span>×</span>
                </button>
              ) : null;
            })}
            {photos.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                aria-label={`移除附件 ${p.caption}`}
              >
                <img src={p.src} alt={p.caption} />
                <span>×</span>
              </button>
            ))}
          </div>
          {localError && (
            <p role="alert" className="inline-error">
              {localError}
            </p>
          )}
          <p className="muted small">
            当前以“{memory?.author || data.names[0]}”记录，{storageHint}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={close}
            >
              取消
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "处理中…" : "保存这段回忆"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function PhotoUploader({
  busy,
  setBusy,
  selectPhotos,
  close,
  save,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  selectPhotos: (f: FileList | null) => Promise<Photo[]>;
  close: () => void;
  save: (p: Photo[]) => boolean | Promise<boolean>;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [error, setError] = useState("");
  return (
    <Modal
      title="留住新的瞬间"
      busy={busy}
      close={() => {
        if (!busy) close();
      }}
    >
      <p className="muted">选择相册照片，也可以在手机文件选择器中拍照。</p>
      <label className="upload-zone large">
        <Icon name="photo" size={32} />
        <strong>{busy ? "正在处理照片…" : "点击选择照片"}</strong>
        <span>一次最多 6 张 · 单张不超过 20 MB</span>
        <span>支持 JPG / PNG / WebP，暂不支持 HEIC</span>
        <input
          type="file"
          aria-label="选择要上传的照片"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={async (e) => {
            const input = e.currentTarget;
            const files = input.files;
            if (!files?.length) return;
            setBusy(true);
            setError("");
            try {
              setPhotos(await selectPhotos(files));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              input.value = "";
              setBusy(false);
            }
          }}
        />
      </label>
      <div className="upload-previews">
        {photos.map((p) => (
          <div key={p.id}>
            <img src={p.src} alt={p.caption} />
            <input
              aria-label={`照片描述 ${p.caption}`}
              value={p.caption}
              maxLength={80}
              onChange={(e) =>
                setPhotos(
                  photos.map((x) =>
                    x.id === p.id ? { ...x, caption: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              className="icon-button"
              aria-label={`取消上传 ${p.caption}`}
              onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="secondary-button" disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="primary-button"
          disabled={busy || !photos.length}
          onClick={async () => {
            if (!(await save(photos)))
              setError("保存失败，请检查网络、访问权限或存储空间后重试。");
          }}
        >
          保存 {photos.length || ""} 张照片
        </button>
      </div>
    </Modal>
  );
}
