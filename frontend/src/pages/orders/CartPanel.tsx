import { useQuery } from "@tanstack/react-query";
import { Button } from "../../shared/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "../../shared/ui/Card";
import { Field, Input, Select } from "../../shared/ui/Field";
import { CustomerPicker } from "./CustomerPicker";
import { offlineFallbackQuery } from "./offlineFallbackQuery";
import { cartLineTotal } from "./menuPricing";
import { missingCustomerDetails, orderTotal, takesCustomer, type OrderDraft } from "./orderDraft";
import { PillButton } from "./PillButton";
import { formatPrice, ORDER_TYPES } from "./posLabels";
import type { CartLine, PaymentMethod } from "./posTypes";
import type { Cart } from "./useCart";

export function CartPanel({
  cart,
  draft,
  onDraftChange,
  canChoosePaymentMethod,
  branchSelected,
  isSubmitting,
  error,
}: {
  cart: Cart;
  draft: OrderDraft;
  onDraftChange: (patch: Partial<OrderDraft>) => void;
  canChoosePaymentMethod: boolean;
  branchSelected: boolean;
  isSubmitting: boolean;
  error: string | null;
}) {
  const customerProblem = missingCustomerDetails(draft);
  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>السلة ({cart.lines.length})</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <OrderDetailsFields draft={draft} onChange={onDraftChange} />

        <div className="max-h-64 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
          {cart.lines.map((line) => (
            <CartLineRow
              key={line.key}
              line={line}
              selected={cart.selectedLine?.key === line.key}
              onSelect={() => cart.selectLine(cart.selectedLine?.key === line.key ? null : line.key)}
              onChangeQuantity={(delta) => cart.changeQuantity(line.key, delta)}
              onChangeAddonQuantity={(variantId, delta) => cart.changeAddonQuantity(line.key, variantId, delta)}
              onRemove={() => cart.removeLine(line.key)}
            />
          ))}
          {cart.lines.length === 0 && <p className="py-6 text-center text-sm text-slate-400">السلة فاضية</p>}
        </div>

        <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">الإجمالي الفرعي</span><span className="font-semibold">{formatPrice(cart.subtotal)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">الخصم</span>
            <Input type="number" min="0" value={draft.discount} onChange={(e) => onDraftChange({ discount: e.target.value })} className="max-w-[100px] py-1 text-end" />
          </div>
          <div className="flex justify-between text-base font-bold text-slate-900"><span>الإجمالي</span><span>{formatPrice(orderTotal(cart.subtotal, draft))}</span></div>
        </div>

        {canChoosePaymentMethod && (
          <PaymentMethodField value={draft.paymentMethodId} onChange={(paymentMethodId) => onDraftChange({ paymentMethodId })} />
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        <Button type="submit" className="w-full" disabled={isSubmitting || cart.lines.length === 0 || !branchSelected || !!customerProblem}>
          {isSubmitting ? "بيتسجّل..." : "تسجيل الطلب"}
        </Button>
        {!branchSelected && <p className="text-center text-xs text-amber-600">اختار الفرع الأول</p>}
        {branchSelected && customerProblem && <p className="text-center text-xs text-amber-600">{customerProblem}</p>}
      </CardBody>
    </Card>
  );
}

function OrderDetailsFields({ draft, onChange }: { draft: OrderDraft; onChange: (patch: Partial<OrderDraft>) => void }) {
  const { orderType } = draft;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ORDER_TYPES.map((t) => (
          <PillButton key={t.value} active={orderType === t.value} onClick={() => onChange({ orderType: t.value })} className="px-4 text-sm">
            {t.label}
          </PillButton>
        ))}
      </div>

      {orderType === "dinein" && (
        <Field label="رقم الترابيزة">
          <Input value={draft.tableNumber} onChange={(e) => onChange({ tableNumber: e.target.value })} />
        </Field>
      )}
      {takesCustomer(orderType) && <CustomerPicker draft={draft} onChange={onChange} />}
    </>
  );
}

function CartLineRow({
  line,
  selected,
  onSelect,
  onChangeQuantity,
  onChangeAddonQuantity,
  onRemove,
}: {
  line: CartLine;
  selected: boolean;
  onSelect: () => void;
  onChangeQuantity: (delta: number) => void;
  onChangeAddonQuantity: (variantId: string, delta: number) => void;
  onRemove: () => void;
}) {
  const canTakeAddons = !line.comboId;
  return (
    <div className={`rounded-lg px-2 py-1.5 text-sm ${selected ? "bg-brand-50 ring-1 ring-brand-300" : ""}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          disabled={!canTakeAddons}
          aria-label={`إضافات ${line.itemName}`}
          className="flex-1 text-start disabled:cursor-default"
        >
          <p className="font-semibold text-slate-800">{line.itemName}</p>
          {line.variantLabel && <p className="text-xs text-slate-400">{line.variantLabel}</p>}
          {canTakeAddons && !selected && <p className="text-xs text-brand-600">+ إضافات</p>}
        </button>
        <div className="flex items-center gap-1">
          <QuantityButton onClick={() => onChangeQuantity(-1)}>−</QuantityButton>
          <span className="w-5 text-center font-semibold">{line.quantity}</span>
          <QuantityButton onClick={() => onChangeQuantity(1)}>+</QuantityButton>
        </div>
        <span className="w-14 text-end font-bold text-slate-900">{formatPrice(cartLineTotal(line))}</span>
        <button type="button" onClick={onRemove} className="text-red-500 hover:text-red-700">×</button>
      </div>
      {line.addons.length > 0 && (
        <ul className="mt-1 space-y-1 border-s-2 border-brand-200 ps-3">
          {line.addons.map((addon) => (
            <li key={addon.variantId} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="flex-1">+ {addon.name}</span>
              <QuantityButton onClick={() => onChangeAddonQuantity(addon.variantId, -1)}>−</QuantityButton>
              <span className="w-4 text-center font-semibold">{addon.quantity}</span>
              <QuantityButton onClick={() => onChangeAddonQuantity(addon.variantId, 1)}>+</QuantityButton>
              <span className="w-14 text-end">{formatPrice(addon.unitPrice * addon.quantity * line.quantity)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuantityButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="h-6 w-6 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">
      {children}
    </button>
  );
}

function PaymentMethodField({ value, onChange }: { value: string; onChange: (paymentMethodId: string) => void }) {
  const paymentMethodsQuery = useQuery({
    queryKey: ["payment-control", "methods"],
    queryFn: () => offlineFallbackQuery<PaymentMethod[]>("/payment-control/payment-methods", "payment-methods"),
  });
  return (
    <Field label="طريقة الدفع (اختياري)">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">- بدون -</option>
        {paymentMethodsQuery.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </Select>
    </Field>
  );
}
