import type { ReactNode } from "react";

export function ShiftSection({ children }: { children: ReactNode }) {
  return <div className="mt-4 border-t border-emerald-200 pt-4">{children}</div>;
}
