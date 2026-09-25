import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { CustomerTokenPayload, CustomerTokenServicePort } from "../../domain/ports/customer-token.service.port";

@Injectable()
export class JwtCustomerTokenService implements CustomerTokenServicePort {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: CustomerTokenPayload): string {
    return this.jwt.sign(payload);
  }

  verify(token: string): CustomerTokenPayload {
    return this.jwt.verify<CustomerTokenPayload>(token);
  }
}
