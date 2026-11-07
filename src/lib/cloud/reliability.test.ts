import { test } from "node:test";
import assert from "node:assert/strict";
import {
  friendlyError,
  isTemporaryError,
  initialPhotoCaption,
  persistPhotoBatch,
  type UploadEntry,
  type ExistingUpload,
  type UploadPort,
} from "./reliability.ts";
const entry = (id: string): UploadEntry => ({
  id,
  space_id: "space",
  author_id: "me",
  path: `space/me/${id}.jpg`,
  caption: "风景",
  kind: "gallery",
  blob: new Blob(["photo"], { type: "image/jpeg" }),
});
test("temporary connection errors distinguished from revoked access", () => {
  assert.equal(
    isTemporaryError({ message: "TypeError: Failed to fetch" }),
    true,
  );
  assert.equal(isTemporaryError({ status: 503, message: "Unavailable" }), true);
  assert.equal(
    isTemporaryError({ status: 403, code: "42501", message: "denied" }),
    false,
  );
  assert.match(
    friendlyError({ message: "Invalid login credentials" }),
    /邮箱或密码不正确/,
  );
});
test("partial batch retry reuses completed uploads and recovers an orphan object", async () => {
  const rows = new Map<string, ExistingUpload>();
  const objects = new Set<string>();
  const attempts: string[] = [];
  let fail = true;
  const port: UploadPort = {
    async find(id) {
      return rows.get(id) || null;
    },
    async store(path) {
      attempts.push(path);
      if (objects.has(path)) throw { statusCode: "409", message: "exists" };
      objects.add(path);
    },
    async insert(row) {
      if (row.id === "two" && fail) throw new Error("metadata failed");
      rows.set(row.id, row);
    },
    async caption(id, text) {
      rows.get(id)!.caption = text;
    },
    async remove() {
      throw new Error("cleanup unavailable");
    },
  };
  await assert.rejects(
    () => persistPhotoBatch([entry("one"), entry("two")], port),
    /已保存 1 张/,
  );
  assert.equal(rows.size, 1);
  assert.equal(objects.size, 2);
  fail = false;
  const result = await persistPhotoBatch([entry("one"), entry("two")], port);
  assert.equal(result.length, 2);
  assert.equal(rows.size, 2);
  assert.equal(objects.size, 2);
  assert.equal(attempts.filter((x) => x.endsWith("one.jpg")).length, 1);
});
test("retry cannot attach an upload that belongs to another account", async () => {
  let touched = false;
  const row = entry("one");
  const port: UploadPort = {
    async find() {
      return { ...row, author_id: "someone-else" };
    },
    async store() {
      touched = true;
    },
    async insert() {
      touched = true;
    },
    async caption() {
      touched = true;
    },
    async remove() {
      touched = true;
    },
  };
  await assert.rejects(() => persistPhotoBatch([row], port), /不匹配/);
  assert.equal(touched, false);
});

test("long and unicode filenames produce valid nonempty captions", () => {
  assert.equal(initialPhotoCaption(".jpg"), "未命名的照片");
  assert.equal(
    Array.from(initialPhotoCaption("风景".repeat(100) + ".jpg")).length,
    80,
  );
  assert.equal(
    initialPhotoCaption("📷".repeat(90) + ".jpg").includes("�"),
    false,
  );
});
