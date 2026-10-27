import { describe, expect, it } from "vitest";
import { buildOrderPayload, missingCustomerDetails, type OrderDraft } from "./orderDraft";
import type { PosCustomer } from "./posCustomer";

const CUSTOMER: PosCustomer = {
  id: "c1",
  name: "سامي",
  isBlocked: false,
  blockReason: null,
  notes: null,
  phones: [{ id: "p1", phone: "01011112222", label: null, isPrimary: true }],
  addresses: [{ id: "a1", label: null, addressDetails: "المعادي", distinguishingMark: null, isDefault: true }],
};

function draft(patch: Partial<OrderDraft>): OrderDraft {
  return {
    orderType: "takeaway",
    tableNumber: "",
    customer: null,
    customerAddressId: "",
    customerName: "",
    customerPhone: "",
    addressDetails: "",
    discount: "",
    paymentMethodId: "",
    ...patch,
  };
}

describe("buildOrderPayload customer fields", () => {
  it("sends only the customer id, chosen phone and address id for a selected customer", () => {
    const payload = buildOrderPayload("b1", draft({ orderType: "delivery", customer: CUSTOMER, customerPhone: "01011112222", customerAddressId: "a1", customerName: "stale" }), []);
    expect(payload).toMatchObject({ customerId: "c1", customerPhone: "01011112222", customerAddressId: "a1" });
    expect(payload).not.toHaveProperty("customerName");
    expect(payload).not.toHaveProperty("addressDetails");
  });

  it("drops the address id on takeaway and all customer fields on dine-in", () => {
    expect(buildOrderPayload("b1", draft({ customer: CUSTOMER, customerAddressId: "a1" }), [])).toMatchObject({ customerAddressId: undefined });
    const dineIn = buildOrderPayload("b1", draft({ orderType: "dinein", customer: CUSTOMER }), []);
    expect(dineIn).not.toHaveProperty("customerId");
  });

  it("keeps the free-text fields when no customer is selected", () => {
    const payload = buildOrderPayload("b1", draft({ orderType: "delivery", customerName: "ضيف", addressDetails: "شارع 9" }), []);
    expect(payload).toMatchObject({ customerName: "ضيف", addressDetails: "شارع 9" });
    expect(payload).not.toHaveProperty("customerId");
  });
});

describe("missingCustomerDetails", () => {
  it("lets takeaway go without a customer", () => {
    expect(missingCustomerDetails(draft({}))).toBeNull();
  });

  it("requires a customer and an address for delivery", () => {
    expect(missingCustomerDetails(draft({ orderType: "delivery" }))).not.toBeNull();
    expect(missingCustomerDetails(draft({ orderType: "delivery", customer: CUSTOMER }))).not.toBeNull();
    expect(missingCustomerDetails(draft({ orderType: "delivery", customer: CUSTOMER, customerAddressId: "a1" }))).toBeNull();
  });
});
