import { DomainError } from "../../../shared/domain/domain-error";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export class InvalidImageError extends DomainError {}

export class ImageNotFoundError extends DomainError {
  constructor() {
    super("الصورة مش موجودة");
  }
}

// النوع الحقيقي من أول بايتات الملف (مش من امتداده أو الـContent-Type اللي المتصفح بعته) - أي حاجة غير
// JPEG/PNG/WebP بترفض، عشان مايترفعش ملف تاني متنكّر كصورة ويتخدم للعملاء
export function detectImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function validateImage(buffer: Buffer | undefined): ImageMime {
  if (!buffer || buffer.length === 0) throw new InvalidImageError("اختار صورة");
  if (buffer.length > MAX_IMAGE_BYTES) throw new InvalidImageError("الصورة أكبر من 2 ميجا");
  const mime = detectImageMime(buffer);
  if (!mime) throw new InvalidImageError("الملف لازم يكون صورة JPG أو PNG أو WebP");
  return mime;
}

// اللينك اللي بيتخزن في المنيو/العروض/المكافآت - نسبي للـAPI (الفرونت إند بيضيف عنوان الباك إند قدامه)
export function imagePath(id: string): string {
  return `/media/images/${id}`;
}
