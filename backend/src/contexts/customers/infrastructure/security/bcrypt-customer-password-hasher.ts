import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import type { CustomerPasswordHasherPort } from "../../domain/ports/customer-password-hasher.port";

const SALT_ROUNDS = 10;

@Injectable()
export class BcryptCustomerPasswordHasher implements CustomerPasswordHasherPort {
  hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, SALT_ROUNDS);
  }

  compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
