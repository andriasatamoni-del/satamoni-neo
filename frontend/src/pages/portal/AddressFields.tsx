import { Field, Input } from "../../shared/ui/Field";

export interface AddressForm {
  area: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  distinguishingMark: string;
  label: string;
}

export const EMPTY_ADDRESS: AddressForm = { area: "", street: "", building: "", floor: "", apartment: "", distinguishingMark: "", label: "" };

export function addressBody(a: AddressForm) {
  return {
    area: a.area,
    street: a.street,
    building: a.building,
    floor: a.floor,
    apartment: a.apartment,
    distinguishingMark: a.distinguishingMark || undefined,
    label: a.label || undefined,
  };
}

// العنوان المقسّم - كل الحقول إلزامية ما عدا العلامة المميزة واسم العنوان (نفس قواعد السيرفر)
export function AddressFields({ value, onChange, showLabel = false }: { value: AddressForm; onChange: (a: AddressForm) => void; showLabel?: boolean }) {
  const set = (key: keyof AddressForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label="المنطقة">
          <Input required value={value.area} onChange={set("area")} placeholder="مثلًا: المعادي، مدينة نصر" name="area" />
        </Field>
      </div>
      <div className="col-span-2">
        <Field label="اسم الشارع">
          <Input required value={value.street} onChange={set("street")} name="street" />
        </Field>
      </div>
      <Field label="رقم العمارة">
        <Input required value={value.building} onChange={set("building")} name="building" />
      </Field>
      <Field label="الدور">
        <Input required value={value.floor} onChange={set("floor")} name="floor" />
      </Field>
      <Field label="رقم الشقة">
        <Input required value={value.apartment} onChange={set("apartment")} name="apartment" />
      </Field>
      <Field label="علامة مميزة (اختياري)">
        <Input value={value.distinguishingMark} onChange={set("distinguishingMark")} placeholder="جنب الصيدلية" name="distinguishingMark" />
      </Field>
      {showLabel && (
        <div className="col-span-2">
          <Field label="اسم العنوان (اختياري)">
            <Input value={value.label} onChange={set("label")} placeholder="البيت، الشغل..." name="label" />
          </Field>
        </div>
      )}
    </div>
  );
}
