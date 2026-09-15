import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { TOKEN_SERVICE, type TokenServicePort } from "../../domain/ports/token.service.port";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import type { AuthenticatedUser } from "../types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("لازم تسجل دخول");

    let payload;
    try {
      payload = this.tokens.verify(header.slice("Bearer ".length));
    } catch {
      throw new UnauthorizedException("التوكن غير صالح أو منتهي، سجل دخول تاني");
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) throw new UnauthorizedException("الحساب ده مش شغال");

    req.user = {
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      permissionGrants: [...user.permissionGrants],
      permissionRevokes: [...user.permissionRevokes],
    };
    return true;
  }
}
