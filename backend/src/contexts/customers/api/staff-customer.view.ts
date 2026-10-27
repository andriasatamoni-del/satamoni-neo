import type { Customer } from "../domain/customer.aggregate";

export function staffCustomerView(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    isBlocked: customer.isBlocked,
    blockReason: customer.blockReason,
    notes: customer.notes,
    phones: customer.phones.map((p) => ({ id: p.id, phone: p.phone, label: p.label, isPrimary: p.isPrimary })),
    addresses: customer.addresses.map((a) => ({
      id: a.id,
      label: a.label,
      addressDetails: a.addressDetails,
      distinguishingMark: a.distinguishingMark,
      isDefault: a.isDefault,
    })),
  };
}
