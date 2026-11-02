import { FormDialog } from "../../shared/ui/FormDialog";
import type { PriceMenu } from "./posTypes";

export function PriceMenuSwitchDialog({
  priceMenu,
  onConfirm,
  onClose,
}: {
  priceMenu: PriceMenu;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <FormDialog
      title={priceMenu === "talabat" ? "التحويل لمنيو طلبات" : "الرجوع للمنيو العادي"}
      submitLabel="تفريغ السلة والتحويل"
      isSubmitting={false}
      error={null}
      onSubmit={onConfirm}
      onClose={onClose}
    >
      <p className="text-sm text-slate-600">الأسعار مختلفة بين المنيوهين، فالأصناف اللي في السلة هتتشال.</p>
    </FormDialog>
  );
}
