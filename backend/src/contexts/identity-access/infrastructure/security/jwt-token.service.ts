import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { TokenPayload, TokenServicePort } from "../../domain/ports/token.service.port";

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(private readonly jwt: JwtService) {}

  sign(payload: TokenPayload): string {
    return this.jwt.sign(payload);
  }

  verify(token: string): TokenPayload {
    return this.jwt.verify<TokenPayload>(token);
  }
}
