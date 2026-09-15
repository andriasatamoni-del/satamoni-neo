export interface TokenPayload {
  sub: string; // user id
  role: string;
}

export interface TokenServicePort {
  sign(payload: TokenPayload): string;
  verify(token: string): TokenPayload;
}

export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE");
