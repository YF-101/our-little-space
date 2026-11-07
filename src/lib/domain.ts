export type Photo = {
  id: string;
  src: string;
  caption: string;
  author: string;
  date: string;
};
export type Memory = {
  id: string;
  title: string;
  body: string;
  date: string;
  author: string;
  photoIds: string[];
  reactions: string[];
};
export type SpaceData = {
  version: 1;
  names: [string, string];
  welcome: string;
  startDate: string;
  memories: Memory[];
  photos: Photo[];
};
export function filterMemories(
  memories: Memory[],
  keyword: string,
  month: string,
) {
  const query = keyword.trim().toLocaleLowerCase();
  return memories
    .filter(
      (m) =>
        (!month || m.date.startsWith(month)) &&
        (!query ||
          `${m.title} ${m.body} ${m.author}`
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function daysTogether(start: string, today: string) {
  return Math.max(
    1,
    Math.floor(
      (Date.parse(today + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
        86400000,
    ) + 1,
  );
}
export function isSpaceData(value: unknown): value is SpaceData {
  if (!value || typeof value !== "object") return false;
  const d = value as SpaceData;
  return (
    d.version === 1 &&
    Array.isArray(d.names) &&
    d.names.length === 2 &&
    d.names.every((n) => typeof n === "string") &&
    typeof d.welcome === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.startDate) &&
    Array.isArray(d.memories) &&
    d.memories.every(
      (m) =>
        typeof m.id === "string" &&
        typeof m.title === "string" &&
        typeof m.body === "string" &&
        typeof m.date === "string" &&
        typeof m.author === "string" &&
        Array.isArray(m.photoIds) &&
        Array.isArray(m.reactions),
    ) &&
    Array.isArray(d.photos) &&
    d.photos.every(
      (p) =>
        typeof p.id === "string" &&
        typeof p.src === "string" &&
        typeof p.caption === "string" &&
        typeof p.author === "string" &&
        typeof p.date === "string",
    )
  );
}
export function removeMemory(data: SpaceData, id: string): SpaceData {
  return { ...data, memories: data.memories.filter((m) => m.id !== id) };
}
export function removePhoto(data: SpaceData, id: string): SpaceData {
  return {
    ...data,
    photos: data.photos.filter((p) => p.id !== id),
    memories: data.memories.map((m) => ({
      ...m,
      photoIds: m.photoIds.filter((photoId) => photoId !== id),
    })),
  };
}
