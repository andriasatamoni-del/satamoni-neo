import type { ReactNode } from "react";

export function PortalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold text-brand-600">ساتاموني</p>
          <h1 className="mt-1 text-sm font-semibold text-slate-700">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
