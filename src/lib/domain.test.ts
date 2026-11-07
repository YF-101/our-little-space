import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterMemories,
  daysTogether,
  isSpaceData,
  removeMemory,
  removePhoto,
  type SpaceData,
} from "./domain.ts";
const rows = [
  {
    id: "1",
    title: "海边",
    body: "一起散步",
    date: "2026-09-01",
    author: "林",
    photoIds: [],
    reactions: [],
  },
  {
    id: "2",
    title: "咖啡",
    body: "想起海边",
    date: "2026-10-01",
    author: "远",
    photoIds: [],
    reactions: [],
  },
];
test("keyword searches body and combines with month", () => {
  assert.deepEqual(
    filterMemories(rows, " 海边 ", "2026-10").map((m) => m.id),
    ["2"],
  );
  assert.equal(filterMemories(rows, "不存在", "").length, 0);
});
test("newest first without mutating records", () => {
  assert.equal(filterMemories(rows, "", "")[0].id, "2");
  assert.equal(rows[0].id, "1");
});
test("day count handles timezone boundaries and future dates", () => {
  assert.equal(daysTogether("2026-11-05", "2026-11-05"), 1);
  assert.equal(daysTogether("2026-11-04", "2026-11-05"), 2);
  assert.equal(daysTogether("2026-11-06", "2026-11-05"), 1);
});
test("rejects invalid persisted data", () => {
  assert.equal(isSpaceData(null), false);
  assert.equal(isSpaceData({ version: 1 }), false);
});

const fixture: SpaceData = {
  version: 1,
  names: ["林", "远"],
  welcome: "你好",
  startDate: "2026-01-01",
  memories: [{ ...rows[0], photoIds: ["p1", "p2"] }],
  photos: [
    {
      id: "p1",
      src: "/one.jpg",
      caption: "一",
      author: "林",
      date: "2026-09-01",
    },
    {
      id: "p2",
      src: "/two.jpg",
      caption: "二",
      author: "林",
      date: "2026-09-01",
    },
  ],
};
test("deleting a memory keeps original photos", () => {
  const result = removeMemory(fixture, "1");
  assert.equal(result.memories.length, 0);
  assert.equal(result.photos.length, 2);
  assert.equal(fixture.memories.length, 1);
});
test("deleting a photo removes references while preserving the memory", () => {
  const result = removePhoto(fixture, "p1");
  assert.deepEqual(result.memories[0].photoIds, ["p2"]);
  assert.deepEqual(
    result.photos.map((p) => p.id),
    ["p2"],
  );
  assert.equal(fixture.photos.length, 2);
});
