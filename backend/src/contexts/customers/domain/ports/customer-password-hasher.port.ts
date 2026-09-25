export interface CustomerPasswordHasherPort {
  hash(plainText: string): Promise<string>;
  compare(plainText: string, hash: string): Promise<boolean>;
}

export const CUSTOMER_PASSWORD_HASHER = Symbol("CUSTOMER_PASSWORD_HASHER");
