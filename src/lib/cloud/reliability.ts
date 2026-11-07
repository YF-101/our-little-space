export function isTemporaryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; code?: string; message?: string };
  return (
    e.status === 0 ||
    (e.status !== undefined && e.status >= 500) ||
    /failed to fetch|fetch failed|network|load failed|timeout|timed out|aborterror/i.test(
      e.message || "",
    )
  );
}
export function friendlyError(error: unknown): string {
  const e =
    error && typeof error === "object"
      ? (error as { message?: string; code?: string })
      : {};
  const text = e.message || "";
  if (/invalid login credentials/i.test(text))
    return "邮箱或密码不正确，请检查后重试。";
  if (/email not confirmed/i.test(text))
    return "账号邮箱尚未确认，请先完成邮箱验证或联系管理员。";
  if (isTemporaryError(error)) return "暂时无法连接云端，请检查网络后重试。";
  if (e.code === "42501")
    return "当前账号没有执行此操作的权限，请确认你仍是小屋成员。";
  if (/jwt expired|invalid refresh token/i.test(text))
    return "登录状态已过期，请重新登录。";
  return text || "操作失败，请稍后重试。";
}
export type UploadEntry = {
  id: string;
  space_id: string;
  author_id: string;
  path: string;
  caption: string;
  kind: "gallery" | "avatar";
  blob: Blob;
};
export type ExistingUpload = Omit<UploadEntry, "blob">;
export type UploadPort = {
  find: (id: string) => Promise<ExistingUpload | null>;
  store: (path: string, blob: Blob) => Promise<void>;
  insert: (entry: ExistingUpload) => Promise<void>;
  caption: (id: string, text: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
};
// 稳定 UUID 是重试键；已成功的批次项不会再次上传或插入。
export async function persistPhotoBatch(
  entries: UploadEntry[],
  port: UploadPort,
): Promise<ExistingUpload[]> {
  const saved: ExistingUpload[] = [];
  try {
    for (const entry of entries) {
      const { blob, ...row } = entry;
      const existing = await port.find(row.id);
      if (existing) {
        if (
          existing.path !== row.path ||
          existing.space_id !== row.space_id ||
          existing.author_id !== row.author_id ||
          existing.kind !== row.kind
        )
          throw new Error("照片标识与当前账号不匹配，请重新选择照片。");
        if (existing.caption !== row.caption)
          await port.caption(row.id, row.caption);
        saved.push(row);
        continue;
      }
      if (blob.type !== "image/jpeg" || blob.size > 5 * 1024 * 1024)
        throw new Error("压缩后照片必须是 5 MB 以内的 JPEG。");
      let storedHere = false;
      try {
        await port.store(row.path, blob);
        storedHere = true;
      } catch (error) {
        const status =
          error && typeof error === "object" && "statusCode" in error
            ? String(error.statusCode)
            : "";
        if (status !== "409") throw error;
        // 上次响应丢失留下的同一 UUID 对象可继续登记；不覆盖文件。
      }
      try {
        await port.insert(row);
      } catch (error) {
        const raced = await port.find(row.id).catch(() => null);
        if (
          !raced ||
          raced.path !== row.path ||
          raced.author_id !== row.author_id
        ) {
          if (storedHere) await port.remove(row.path).catch(() => undefined);
          throw error;
        }
      }
      saved.push(row);
    }
    return saved;
  } catch (error) {
    throw new Error(
      `${friendlyError(error)}${saved.length ? ` 已保存 ${saved.length} 张；可直接重试，已保存的照片不会重复上传。` : ""}`,
    );
  }
}
export function initialPhotoCaption(filename: string) {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  return Array.from(stem || "未命名的照片")
    .slice(0, 80)
    .join("");
}
