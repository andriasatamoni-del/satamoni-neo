import { detectImageMime, InvalidImageError, MAX_IMAGE_BYTES, validateImage } from "../../../src/contexts/media/domain/image-format";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("image-format - النوع الحقيقي من محتوى الملف", () => {
  test("بيتعرّف على JPEG وPNG وWebP", () => {
    expect(detectImageMime(JPEG)).toBe("image/jpeg");
    expect(detectImageMime(PNG)).toBe("image/png");
    expect(detectImageMime(WEBP)).toBe("image/webp");
  });

  test("بيرفض أي ملف تاني حتى لو اسمه .jpg (SVG/HTML/GIF)", () => {
    expect(detectImageMime(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageMime(Buffer.from("GIF89a"))).toBeNull();
    expect(() => validateImage(Buffer.from("<html>"))).toThrow(InvalidImageError);
  });

  test("فاضي أو أكبر من 2 ميجا مرفوض", () => {
    expect(() => validateImage(undefined)).toThrow("اختار صورة");
    expect(() => validateImage(Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]))).toThrow("أكبر من 2 ميجا");
  });
});
