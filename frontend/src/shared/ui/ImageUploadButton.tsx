import { useRef, useState } from "react";
import { ApiError } from "../api/client";
import { resolveImageUrl, uploadImage } from "../api/images";

// صورة مصغّرة + زرار رفع/تغيير - بيرفع الصورة ويرجّع مسارها للي بيستخدمه (يحفظه على الصنف/العرض/المكافأة)
export function ImageUploadButton({
  imageUrl,
  onUploaded,
  disabled,
  testId,
}: {
  imageUrl: string | null | undefined;
  onUploaded: (url: string) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = resolveImageUrl(imageUrl);

  return (
    <div className="flex items-center gap-2">
      {src ? (
        <img src={src} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-slate-200" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">—</div>
      )}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="text-xs font-semibold text-brand-600 hover:underline disabled:text-slate-400"
      >
        {busy ? "بيترفع..." : src ? "تغيير" : "رفع صورة"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid={testId}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            onUploaded((await uploadImage(file)).url);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "فشل رفع الصورة");
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
