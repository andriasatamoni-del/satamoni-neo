import type { HTMLAttributes } from "react";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-800",
  success: "bg-emerald-100 text-emerald-700",
  danger: "bg-red-100 text-red-700",
  brand: "bg-brand-100 text-brand-800",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}

// خريطة عامة لأشهر كلمات الحالة العربية المستخدمة في الشاشات المختلفة -> تون لوني مناسب.
// أي كلمة مش موجودة بترجع "neutral" افتراضيًا بدل ما تكسر أي حاجة.
const STATUS_TONE_MAP: Record<string, Tone> = {
  "بيتحضّر": "warning",
  "بيتحضر": "warning",
  "في الطريق": "info",
  "مكتمل": "success",
  "مرحّل": "success",
  "مرحل": "success",
  "معتمد": "success",
  "نشط": "success",
  "مقبول": "success",
  "ملغي": "danger",
  "مرفوض": "danger",
  "متوقف": "danger",
  "DRAFT": "neutral",
  "مسودة": "neutral",
  "في الانتظار": "warning",
  "معلّق": "warning",
  "معلق": "warning",
};

export function statusTone(status: string): Tone {
  return STATUS_TONE_MAP[status] ?? "neutral";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
