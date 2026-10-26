import type { ReactNode } from "react";

export function MenuTile({
  name,
  priceLabel,
  badge,
  cartQuantity,
  highlighted = false,
  onClick,
}: {
  name: string;
  priceLabel: string;
  badge?: ReactNode;
  cartQuantity: number;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-start gap-1 rounded-xl border p-3 text-start shadow-sm transition-colors hover:border-brand-400 hover:shadow-md ${
        highlighted ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-white"
      }`}
    >
      {cartQuantity > 0 && (
        <span className="absolute end-2 top-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
          {cartQuantity}
        </span>
      )}
      {badge}
      <p className="text-sm font-bold text-slate-900">{name}</p>
      <p className="text-sm font-semibold text-brand-700">{priceLabel}</p>
    </button>
  );
}

export function MenuTileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
