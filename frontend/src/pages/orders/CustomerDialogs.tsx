import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Field";
import { AddressFields, EMPTY_ADDRESS, type AddressForm } from "../../shared/customers/AddressFields";
import { errorMessage } from "./errorMessage";
import { PosDialog } from "./PosDialog";
import {
  addCustomerAddress,
  addCustomerPhone,
  looksLikePhone,
  registerCustomer,
  type PhoneForm,
  type PosCustomer,
} from "./posCustomer";

const EMPTY_PHONE: PhoneForm = { phone: "", label: "" };

export function NewCustomerDialog({
  initialQuery,
  requireAddress,
  onCreated,
  onClose,
}: {
  initialQuery: string;
  requireAddress: boolean;
  onCreated: (customer: PosCustomer) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(looksLikePhone(initialQuery) ? "" : initialQuery.trim());
  const [phone, setPhone] = useState(looksLikePhone(initialQuery) ? initialQuery.trim() : "");
  const [extraPhones, setExtraPhones] = useState<PhoneForm[]>([]);
  const [addresses, setAddresses] = useState<AddressForm[]>(requireAddress ? [EMPTY_ADDRESS] : []);
  const register = useMutation({ mutationFn: registerCustomer, onSuccess: onCreated });

  return (
    <PosDialog
      title="عميل جديد"
      submitLabel="حفظ العميل"
      isSubmitting={register.isPending}
      error={errorMessage(register.error)}
      onSubmit={() => register.mutate({ name, phone, extraPhones, addresses })}
      onClose={onClose}
    >
      <Field label="الاسم">
        <Input required autoFocus={!name} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="رقم الموبايل الأساسي">
        <Input required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>

      <EditableList
        title="أرقام إضافية"
        addLabel="+ رقم تاني"
        items={extraPhones}
        onChange={setExtraPhones}
        newItem={EMPTY_PHONE}
        render={(value, onChange) => <PhoneFields value={value} onChange={onChange} />}
      />

      <EditableList
        title="العناوين"
        addLabel="+ عنوان"
        items={addresses}
        onChange={setAddresses}
        newItem={EMPTY_ADDRESS}
        minItems={requireAddress ? 1 : 0}
        render={(value, onChange) => <AddressFields value={value} onChange={onChange} showLabel />}
      />
    </PosDialog>
  );
}

export function AddPhoneDialog({ customer, onAdded, onClose }: { customer: PosCustomer; onAdded: (customer: PosCustomer, phone: string) => void; onClose: () => void }) {
  const [value, setValue] = useState<PhoneForm>(EMPTY_PHONE);
  const add = useMutation({
    mutationFn: () => addCustomerPhone(customer.id, value),
    onSuccess: (updated) => onAdded(updated, updated.phones[updated.phones.length - 1].phone),
  });
  return (
    <PosDialog title={`رقم جديد لـ${customer.name ?? "العميل"}`} submitLabel="إضافة" isSubmitting={add.isPending} error={errorMessage(add.error)} onSubmit={() => add.mutate()} onClose={onClose}>
      <PhoneFields value={value} onChange={setValue} autoFocus />
    </PosDialog>
  );
}

export function AddAddressDialog({ customer, onAdded, onClose }: { customer: PosCustomer; onAdded: (customer: PosCustomer, addressId: string) => void; onClose: () => void }) {
  const [value, setValue] = useState<AddressForm>(EMPTY_ADDRESS);
  const add = useMutation({
    mutationFn: () => addCustomerAddress(customer.id, value),
    onSuccess: ({ customer: updated, addressId }) => onAdded(updated, addressId),
  });
  return (
    <PosDialog title={`عنوان جديد لـ${customer.name ?? "العميل"}`} submitLabel="إضافة" isSubmitting={add.isPending} error={errorMessage(add.error)} onSubmit={() => add.mutate()} onClose={onClose}>
      <AddressFields value={value} onChange={setValue} showLabel />
    </PosDialog>
  );
}

function PhoneFields({ value, onChange, autoFocus = false }: { value: PhoneForm; onChange: (value: PhoneForm) => void; autoFocus?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="الرقم">
        <Input required autoFocus={autoFocus} inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
      </Field>
      <Field label="وصف (اختياري)">
        <Input value={value.label} placeholder="البيت، الشغل..." onChange={(e) => onChange({ ...value, label: e.target.value })} />
      </Field>
    </div>
  );
}

function EditableList<T>({
  title,
  addLabel,
  items,
  onChange,
  newItem,
  minItems = 0,
  render,
}: {
  title: string;
  addLabel: string;
  items: T[];
  onChange: (items: T[]) => void;
  newItem: T;
  minItems?: number;
  render: (value: T, onChange: (value: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...items, newItem])}>{addLabel}</Button>
      </div>
      {items.map((item, index) => (
        <div key={index} className="relative rounded-lg border border-slate-200 p-3">
          {items.length > minItems && (
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="absolute end-2 top-1 text-red-500 hover:text-red-700"
            >
              ×
            </button>
          )}
          {render(item, (value) => onChange(items.map((current, i) => (i === index ? value : current))))}
        </div>
      ))}
    </div>
  );
}
