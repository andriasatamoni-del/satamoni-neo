import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../shared/auth/AuthContext";
import { PERMISSION } from "../../shared/auth/permissions";
import { can } from "../../shared/auth/roles";
import { useOnlineStatus } from "../../shared/offline/useOnlineStatus";
import { Button } from "../../shared/ui/Button";
import { Field, Input, Textarea } from "../../shared/ui/Field";
import { AddAddressDialog, AddPhoneDialog, NewCustomerDialog } from "./CustomerDialogs";
import type { OrderDraft } from "./orderDraft";
import { PillButton } from "./PillButton";
import { defaultAddressId, lookupCustomers, MIN_LOOKUP_LENGTH, primaryPhone, type PosCustomer } from "./posCustomer";

type DraftChange = (patch: Partial<OrderDraft>) => void;

const LOOKUP_DEBOUNCE_MS = 300;

export function CustomerPicker({ draft, onChange }: { draft: OrderDraft; onChange: DraftChange }) {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const canLookup = can(user, PERMISSION.CUSTOMERS_VIEW, PERMISSION.CUSTOMERS_MANAGE, PERMISSION.ORDERS_CREATE);
  const canManage = can(user, PERMISSION.CUSTOMERS_MANAGE);
  const isDelivery = draft.orderType === "delivery";

  function select(customer: PosCustomer, patch: Partial<OrderDraft> = {}) {
    onChange({
      customer,
      customerPhone: primaryPhone(customer),
      customerAddressId: defaultAddressId(customer),
      customerName: "",
      addressDetails: "",
      ...patch,
    });
  }

  if (draft.customer) {
    return <SelectedCustomer draft={draft} customer={draft.customer} isDelivery={isDelivery} canManage={canManage && isOnline} onChange={onChange} onSelect={select} />;
  }
  if (!isOnline || !canLookup) return <ManualCustomerFields draft={draft} isDelivery={isDelivery} onChange={onChange} />;
  return <CustomerSearch isDelivery={isDelivery} canManage={canManage} onSelect={select} />;
}

function CustomerSearch({ isDelivery, canManage, onSelect }: { isDelivery: boolean; canManage: boolean; onSelect: (customer: PosCustomer) => void }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const term = useDebouncedValue(query.trim(), LOOKUP_DEBOUNCE_MS);
  const lookup = useQuery({
    queryKey: ["customers", "lookup", term],
    queryFn: () => lookupCustomers(term),
    enabled: term.length >= MIN_LOOKUP_LENGTH,
    staleTime: 30_000,
  });
  const results = term.length >= MIN_LOOKUP_LENGTH ? lookup.data ?? [] : [];
  const searched = term.length >= MIN_LOOKUP_LENGTH && lookup.isSuccess;

  return (
    <div className="space-y-2">
      <Field label={isDelivery ? "العميل" : "العميل (اختياري)"}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="دوّر برقم الموبايل أو الاسم" />
      </Field>

      {lookup.isFetching && <p className="text-xs text-slate-400">بيدوّر...</p>}
      {results.length > 0 && (
        <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {results.map((customer) => (
            <li key={customer.id}>
              <button type="button" onClick={() => onSelect(customer)} className="w-full px-3 py-2 text-start hover:bg-brand-50">
                <span className="block text-sm font-semibold text-slate-800">
                  {customer.name ?? "بدون اسم"}
                  {customer.isBlocked && <span className="ms-2 text-xs font-bold text-red-600">محظور</span>}
                </span>
                <span className="block text-xs text-slate-500" dir="ltr">{customer.phones.map((p) => p.phone).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && results.length === 0 && <p className="text-xs text-slate-500">مفيش عميل بالبيانات دي</p>}

      <div className="flex items-center justify-between gap-2">
        {!isDelivery && <span className="text-xs text-slate-400">سيبه فاضي لو عميل من غير بيانات</span>}
        {canManage && (
          <Button type="button" size="sm" variant={searched && results.length === 0 ? "primary" : "secondary"} className="ms-auto" onClick={() => setCreating(true)}>
            + عميل جديد
          </Button>
        )}
      </div>

      {creating && (
        <NewCustomerDialog
          initialQuery={query}
          requireAddress={isDelivery}
          onClose={() => setCreating(false)}
          onCreated={(customer) => {
            setCreating(false);
            onSelect(customer);
          }}
        />
      )}
    </div>
  );
}

function SelectedCustomer({
  draft,
  customer,
  isDelivery,
  canManage,
  onChange,
  onSelect,
}: {
  draft: OrderDraft;
  customer: PosCustomer;
  isDelivery: boolean;
  canManage: boolean;
  onChange: DraftChange;
  onSelect: (customer: PosCustomer, patch?: Partial<OrderDraft>) => void;
}) {
  const [dialog, setDialog] = useState<"phone" | "address" | null>(null);
  const keepSelection = { customerPhone: draft.customerPhone, customerAddressId: draft.customerAddressId };

  return (
    <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{customer.name ?? "بدون اسم"}</p>
          {customer.notes && <p className="text-xs text-slate-500">{customer.notes}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ customer: null, customerPhone: "", customerAddressId: "" })}>
          تغيير
        </Button>
      </div>
      {customer.isBlocked && (
        <p className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          العميل ده محظور{customer.blockReason ? `: ${customer.blockReason}` : ""}
        </p>
      )}

      <ChoiceGroup
        title="رقم التواصل"
        addLabel={canManage ? "+ رقم" : null}
        onAdd={() => setDialog("phone")}
        options={customer.phones.map((p) => ({ value: p.phone, label: p.label ? `${p.phone} (${p.label})` : p.phone }))}
        value={draft.customerPhone}
        onChange={(customerPhone) => onChange({ customerPhone })}
      />

      {isDelivery && (
        <ChoiceGroup
          title="عنوان التوصيل"
          addLabel={canManage ? "+ عنوان" : null}
          onAdd={() => setDialog("address")}
          options={customer.addresses.map((a) => ({
            value: a.id,
            label: [a.label, a.addressDetails, a.distinguishingMark].filter(Boolean).join(" - "),
          }))}
          value={draft.customerAddressId}
          onChange={(customerAddressId) => onChange({ customerAddressId })}
          emptyText="مفيش عناوين محفوظة - ضيف عنوان"
          stacked
        />
      )}

      {dialog === "phone" && (
        <AddPhoneDialog
          customer={customer}
          onClose={() => setDialog(null)}
          onAdded={(updated, customerPhone) => {
            setDialog(null);
            onSelect(updated, { ...keepSelection, customerPhone });
          }}
        />
      )}
      {dialog === "address" && (
        <AddAddressDialog
          customer={customer}
          onClose={() => setDialog(null)}
          onAdded={(updated, customerAddressId) => {
            setDialog(null);
            onSelect(updated, { ...keepSelection, customerAddressId });
          }}
        />
      )}
    </div>
  );
}

function ChoiceGroup({
  title,
  addLabel,
  onAdd,
  options,
  value,
  onChange,
  emptyText,
  stacked = false,
}: {
  title: string;
  addLabel: string | null;
  onAdd: () => void;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  emptyText?: string;
  stacked?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        {addLabel && (
          <button type="button" onClick={onAdd} className="text-xs font-semibold text-brand-700 hover:underline">
            {addLabel}
          </button>
        )}
      </div>
      {options.length === 0 && emptyText && <p className="text-xs text-amber-700">{emptyText}</p>}
      <div className={stacked ? "space-y-1.5" : "flex flex-wrap gap-1.5"}>
        {options.map((option) => (
          <PillButton
            key={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
            className={`px-3 text-xs ${stacked ? "block w-full text-start" : ""}`}
          >
            {option.label}
          </PillButton>
        ))}
      </div>
    </div>
  );
}

function ManualCustomerFields({ draft, isDelivery, onChange }: { draft: OrderDraft; isDelivery: boolean; onChange: DraftChange }) {
  return (
    <>
      <Field label="اسم العميل (اختياري)">
        <Input value={draft.customerName} onChange={(e) => onChange({ customerName: e.target.value })} />
      </Field>
      <Field label="رقم الموبايل (اختياري)">
        <Input value={draft.customerPhone} onChange={(e) => onChange({ customerPhone: e.target.value })} />
      </Field>
      {isDelivery && (
        <Field label="العنوان">
          <Textarea rows={2} value={draft.addressDetails} onChange={(e) => onChange({ addressDetails: e.target.value })} />
        </Field>
      )}
    </>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
