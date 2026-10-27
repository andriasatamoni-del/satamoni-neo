import { apiRequest } from "../../shared/api/client";
import { addressBody, type AddressForm } from "../../shared/customers/AddressFields";

export interface PosCustomerPhone { id: string; phone: string; label: string | null; isPrimary: boolean; }
export interface PosCustomerAddress { id: string; label: string | null; addressDetails: string; distinguishingMark: string | null; isDefault: boolean; }
export interface PosCustomer {
  id: string;
  name: string | null;
  isBlocked: boolean;
  blockReason: string | null;
  notes: string | null;
  phones: PosCustomerPhone[];
  addresses: PosCustomerAddress[];
}

export interface PhoneForm { phone: string; label: string; }

export const MIN_LOOKUP_LENGTH = 2;

function phoneBody(p: PhoneForm) {
  return { phone: p.phone.trim(), label: p.label.trim() || undefined };
}

export function lookupCustomers(q: string): Promise<PosCustomer[]> {
  return apiRequest<PosCustomer[]>(`/customers/lookup?q=${encodeURIComponent(q)}`);
}

export function registerCustomer(input: { name: string; phone: string; extraPhones: PhoneForm[]; addresses: AddressForm[] }): Promise<PosCustomer> {
  return apiRequest<PosCustomer>("/customers", {
    method: "POST",
    body: {
      name: input.name.trim(),
      phone: input.phone.trim(),
      extraPhones: input.extraPhones.filter((p) => p.phone.trim()).map(phoneBody),
      addresses: input.addresses.map(addressBody),
    },
  });
}

export function addCustomerPhone(customerId: string, phone: PhoneForm): Promise<PosCustomer> {
  return apiRequest<PosCustomer>(`/customers/${customerId}/phones`, { method: "POST", body: phoneBody(phone) });
}

export async function addCustomerAddress(customerId: string, address: AddressForm): Promise<{ customer: PosCustomer; addressId: string }> {
  return apiRequest(`/customers/${customerId}/addresses`, { method: "POST", body: addressBody(address) });
}

export function defaultAddressId(customer: PosCustomer): string {
  return (customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0])?.id ?? "";
}

export function primaryPhone(customer: PosCustomer): string {
  return (customer.phones.find((p) => p.isPrimary) ?? customer.phones[0])?.phone ?? "";
}

export function looksLikePhone(q: string): boolean {
  return /^[\d\s+-]+$/.test(q.trim());
}
