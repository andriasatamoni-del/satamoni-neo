import { column } from "../../../../shared/tabular/sheet/sheet-column";
import { defineSheet, type SheetRow } from "../../../../shared/tabular/sheet/sheet-definition";

export const CUSTOMER_SHEET = defineSheet({
  name: "customers",
  sheetName: "العملاء",
  key: "phone",
  columns: [
    column.text("phone", "رقم الموبايل", { maxLength: 20 }).required().withWidth(16),
    column.text("name", "اسم العميل", { maxLength: 80 }).required().withWidth(28),
    column.text("phone2", "رقم تاني", { maxLength: 20 }).withWidth(16),
    column.text("area", "المنطقة", { maxLength: 120 }).withWidth(18),
    column.text("street", "اسم الشارع", { maxLength: 120 }).withWidth(22),
    column.text("building", "رقم العمارة", { maxLength: 120 }).withWidth(12),
    column.text("floor", "الدور", { maxLength: 120 }).withWidth(8),
    column.text("apartment", "رقم الشقة", { maxLength: 120 }).withWidth(10),
    column.text("addressMark", "علامة مميزة", { maxLength: 200 }).withWidth(24),
    column.text("fullAddress", "العنوان كامل (للعرض فقط)", { maxLength: 1000 }).withWidth(48),
    column.text("notes", "ملاحظات", { maxLength: 500 }).withWidth(40),
  ],
});

export type CustomerSheetRow = SheetRow<typeof CUSTOMER_SHEET>;

export interface ExportedCustomer {
  phone: string;
  name: string | null;
  phone2: string | null;
  notes: string | null;
  address_details: string | null;
  first_address: {
    area: string | null;
    street: string | null;
    building: string | null;
    floor: string | null;
    apartment: string | null;
    distinguishing_mark: string | null;
    address_details: string;
  } | null;
}

export function customerSheetRow(customer: ExportedCustomer): CustomerSheetRow {
  const address = customer.first_address;
  return {
    phone: customer.phone,
    name: customer.name ?? "",
    phone2: customer.phone2,
    area: address?.area ?? null,
    street: address?.street ?? null,
    building: address?.building ?? null,
    floor: address?.floor ?? null,
    apartment: address?.apartment ?? null,
    addressMark: address?.distinguishing_mark ?? null,
    fullAddress: address?.address_details ?? customer.address_details,
    notes: customer.notes,
  };
}

export function sheetAddressOf(row: CustomerSheetRow) {
  const address = {
    area: row.area ?? "",
    street: row.street ?? "",
    building: row.building ?? "",
    floor: row.floor ?? "",
    apartment: row.apartment ?? "",
    distinguishingMark: row.addressMark,
  };
  const anyFilled = [address.area, address.street, address.building, address.floor, address.apartment, address.distinguishingMark ?? ""].some((value) => value.trim() !== "");
  return anyFilled ? address : undefined;
}

const MOBILE_WITHOUT_LEADING_ZERO = /^1\d{9}$/;

export function sheetPhone(raw: string): string {
  const phone = raw.trim().replace(/[\s-]/g, "");
  return MOBILE_WITHOUT_LEADING_ZERO.test(phone) ? `0${phone}` : phone;
}
