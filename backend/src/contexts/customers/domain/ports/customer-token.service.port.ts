export interface CustomerTokenPayload {
  sub: string; // customer id
}

export interface CustomerTokenServicePort {
  sign(payload: CustomerTokenPayload): string;
  verify(token: string): CustomerTokenPayload;
}

export const CUSTOMER_TOKEN_SERVICE = Symbol("CUSTOMER_TOKEN_SERVICE");
