import { getCloudClient } from "./client";
import { signedPhotoUrl } from "./photo-url";
import { friendlyError, persistPhotoBatch } from "./reliability";
import type {
  CloudSnapshot,
  CloudSpace,
  CloudMember,
  CloudProfile,
  CloudMemory,
  CloudPhoto,
  CloudComment,
  CloudReaction,
  CloudInvitation,
} from "./types";
import type { Photo } from "../domain";
export const BUCKET = "ols-private";
export const errorText = friendlyError;
export async function rpc<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getCloudClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function loadSnapshot(): Promise<CloudSnapshot | null> {
  const db = getCloudClient();
  const { data: spaces, error: spaceError } = await db
    .from("ols_spaces")
    .select("id,owner_id,welcome,start_date,revision")
    .returns<CloudSpace[]>();
  if (spaceError) throw spaceError;
  if (!spaces?.length) return null;
  const space = spaces[0];
  const queries = await Promise.all([
    db
      .from("ols_members")
      .select("*")
      .eq("space_id", space.id)
      .eq("active", true)
      .returns<CloudMember[]>(),
    db
      .from("ols_memories")
      .select("*")
      .eq("space_id", space.id)
      .order("memory_date", { ascending: false })
      .returns<CloudMemory[]>(),
    db
      .from("ols_photos")
      .select("id,space_id,author_id,path,caption,kind,created_at")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false })
      .returns<Omit<CloudPhoto, "src">[]>(),
    db
      .from("ols_comments")
      .select("*")
      .eq("space_id", space.id)
      .order("created_at")
      .returns<CloudComment[]>(),
    db
      .from("ols_reactions")
      .select("*")
      .eq("space_id", space.id)
      .returns<CloudReaction[]>(),
    db
      .from("ols_invitations")
      .select("*")
      .eq("space_id", space.id)
      .order("created_at", { ascending: false })
      .returns<CloudInvitation[]>(),
  ]);
  for (const result of queries) if (result.error) throw result.error;
  const [members, memories, photoRows, comments, reactions, invitations] =
    queries.map((q) => q.data || []) as [
      CloudMember[],
      CloudMemory[],
      Omit<CloudPhoto, "src">[],
      CloudComment[],
      CloudReaction[],
      CloudInvitation[],
    ];
  const { data: profiles, error: profileError } = await db
    .from("ols_profiles")
    .select("id,nickname,avatar_id")
    .in(
      "id",
      members.map((m) => m.user_id),
    )
    .returns<CloudProfile[]>();
  if (profileError) throw profileError;
  let links: { memory_id: string; photo_id: string }[] = [];
  if (memories.length) {
    const result = await db
      .from("ols_memory_photos")
      .select("memory_id,photo_id")
      .in(
        "memory_id",
        memories.map((m) => m.id),
      );
    if (result.error) throw result.error;
    links = result.data || [];
  }
  let photos: CloudPhoto[] = [];
  if (photoRows.length) {
    const signed = await db.storage.from(BUCKET).createSignedUrls(
      photoRows.map((p) => p.path),
      120,
    );
    if (signed.error) throw signed.error;
    photos = photoRows.map((p, i) => ({
      ...p,
      src: signedPhotoUrl(signed.data?.[i]),
    }));
    if (photos.some((p) => !p.src))
      throw new Error("照片授权链接获取失败，请刷新后重试。");
  }
  // 各查询期间成员可能被撤销；再次验证后才将快照交给界面。
  const verified = await db
    .from("ols_members")
    .select("user_id")
    .eq("space_id", space.id)
    .eq("active", true);
  if (verified.error) throw verified.error;
  if (!verified.data?.length) return null;
  return {
    space,
    members,
    profiles: profiles || [],
    memories,
    photos,
    links,
    comments,
    reactions,
    invitations,
  };
}
export async function uploadPhotos(
  spaceId: string,
  userId: string,
  photos: Photo[],
  kind: "gallery" | "avatar" = "gallery",
) {
  const db = getCloudClient();
  const entries = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      space_id: spaceId,
      author_id: userId,
      path: `${spaceId}/${userId}/${photo.id}.jpg`,
      caption: photo.caption,
      kind,
      blob: await (await fetch(photo.src)).blob(),
    })),
  );
  const result = await persistPhotoBatch(entries, {
    async find(id) {
      const r = await db
        .from("ols_photos")
        .select("id,space_id,author_id,path,caption,kind")
        .eq("id", id)
        .maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
    async store(path, blob) {
      const r = await db.storage
        .from(BUCKET)
        .upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "60",
        });
      if (r.error) throw r.error;
    },
    async insert(row) {
      const { author_id, ...input } = row;
      void author_id;
      const r = await db.from("ols_photos").insert(input);
      if (r.error) throw r.error;
    },
    async caption(id, caption) {
      await updateRows("ols_photos", id, { caption });
    },
    async remove(path) {
      const r = await db.storage.from(BUCKET).remove([path]);
      if (r.error) throw r.error;
    },
  });
  return result.map((row) => ({
    ...row,
    src: photos.find((p) => p.id === row.id)!.src,
    created_at: new Date().toISOString(),
  }));
}
export async function deletePhoto(photo: CloudPhoto) {
  const db = getCloudClient();
  await rpc("ols_delete_photo", { p: photo.id });
  const removed = await db.storage.from(BUCKET).remove([photo.path]);
  if (removed.error)
    throw new Error("照片已隐藏，但存储文件清理失败。请在存储后台清理该文件。");
}
export async function updateRows(
  table: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await getCloudClient()
    .from(table)
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("记录不存在或没有修改权限。");
}
export async function deleteRows(table: string, id: string) {
  const { data, error } = await getCloudClient()
    .from(table)
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("记录不存在或没有删除权限。");
}
function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取照片"));
    reader.readAsDataURL(blob);
  });
}
export async function exportSnapshot(snapshot: CloudSnapshot, userId: string) {
  const fresh = await loadSnapshot();
  if (!fresh || fresh.space.id !== snapshot.space.id)
    throw new Error("小屋访问权限已变化，无法导出。请刷新页面。");
  const photos = [];
  for (const p of fresh.photos) {
    const result = await getCloudClient().storage.from(BUCKET).download(p.path);
    if (result.error) throw result.error;
    const { src, ...metadata } = p;
    void src;
    photos.push({ ...metadata, dataUrl: await blobDataUrl(result.data) });
  }
  const allowed = await getCloudClient()
    .from("ols_spaces")
    .select("id")
    .eq("id", fresh.space.id)
    .maybeSingle();
  if (allowed.error) throw allowed.error;
  if (!allowed.data)
    throw new Error("导出期间访问权限已变化，请重新登录后再试。");
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "our-little-space-cloud-v1",
          exportedAt: new Date().toISOString(),
          exportedBy: userId,
          scope: "当前获授权的小屋共享内容与成员资料，不包含认证凭据",
          ...fresh,
          photos,
          invitations: undefined,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `时光小屋-${new Date().toLocaleDateString("sv-SE")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
