import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function PortalShell({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-8 sm:items-center">
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"}`}>
        <div className="mb-6 text-center">
          <Link to="/order" className="text-lg font-extrabold text-brand-600">
            ساتاموني
          </Link>
          <h1 className="mt-1 text-sm font-semibold text-slate-700">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
