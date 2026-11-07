import { isSpaceData, type SpaceData } from "./domain";
export const STORAGE_KEY = "our-little-space-demo-v1";
export function readSpace(): SpaceData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!isSpaceData(value))
    throw new Error("本地数据格式不正确，请先导出备份后联系开发者。");
  return value;
}
export function writeSpace(data: SpaceData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
export async function compressImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "请选择 JPG、PNG 或 WebP 图片。iPhone 请使用兼容性最佳格式，HEIC 暂不支持。",
    );
  if (file.size > 20 * 1024 * 1024) throw new Error("单张图片请小于 20 MB。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法处理图片。");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.76);
  } finally {
    URL.revokeObjectURL(url);
  }
}
