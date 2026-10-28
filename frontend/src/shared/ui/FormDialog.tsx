import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export function FormDialog({
  title,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  onClose,
  size = "md",
  children,
}: {
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
  size?: "md" | "xl";
  children: ReactNode;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    onSubmit();
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full ${size === "xl" ? "max-w-5xl" : "max-w-lg"} space-y-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">×</button>
        </div>
        {children}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "بيتحفظ..." : submitLabel}</Button>
        </div>
      </form>
    </div>,
    document.body
  );
}
