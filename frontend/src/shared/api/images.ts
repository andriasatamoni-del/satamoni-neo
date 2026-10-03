import { API_BASE_URL, ApiError, getToken } from "./client";
import { friendlyErrorMessage } from "./errors";

// الصور المرفوعة بتتخزن كمسار نسبي للـAPI (/media/images/<id>) - الفرونت إند بيضيف عنوان الباك إند
// قدامه. أي لينك كامل (https://...) بيتعرض زي ما هو
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/media/") ? `${API_BASE_URL}${url}` : url;
}

const MAX_DIMENSION = 1000;

// تصغير الصورة في المتصفح قبل الرفع (أقصى 1000px، WebP أو JPEG) - صورة موبايل 5 ميجا بتبقى ~100 كيلو،
// فالمنيو بيفتح بسرعة على نت الموبايل
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  return (await toBlob("image/jpeg")) ?? file;
}

export async function uploadImage(file: File): Promise<{ id: string; url: string }> {
  if (!file.type.startsWith("image/")) throw new ApiError("اختار صورة", 400);
  const body = new FormData();
  body.append("file", await shrink(file), "image");
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/media/images`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(friendlyErrorMessage(res.status, payload?.error ?? payload?.message) || "فشل رفع الصورة", res.status, payload);
  return payload;
}
