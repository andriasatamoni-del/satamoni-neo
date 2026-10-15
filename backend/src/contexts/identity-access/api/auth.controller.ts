import { Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards, UseFilters } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { LoginHandler } from "../application/commands/login.handler";
import { USER_REPOSITORY, type UserRepositoryPort } from "../domain/ports/user-repository.port";
import { ROLE_PERMISSION_REPOSITORY, type RolePermissionRepositoryPort } from "../domain/ports/role-permission-repository.port";
import { User } from "../domain/user.aggregate";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { DomainErrorFilter } from "./filters/domain-error.filter";
import type { AuthenticatedUser } from "./types";
import type { Permission } from "../domain/permission";

@Controller("auth")
@UseFilters(DomainErrorFilter)
export class AuthController {
  constructor(
    private readonly loginHandler: LoginHandler,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort
  ) {}

  // حد أضيق بكتير من الافتراضي العام (راجع app.module.ts) - 5 محاولات كل دقيقة لكل IP، عشان تخمين
  // كلمة السر بالتجربة والخطأ (brute-force) يتقفل بسرعة من غير ما يأثر على استخدام عادي. قابل للتعديل
  // عبر THROTTLE_LOGIN_LIMIT - بيئة الاختبار (test/integration/setup.ts) بترفعه عشان اختبارات الـe2e
  @Throttle({ default: { limit: Number(process.env.THROTTLE_LOGIN_LIMIT) || 5, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto) {
    const { token, user } = await this.loginHandler.execute(dto);
    return { token, user: toCurrentUser(user, await this.rolePermissions.permissionsForRoles(user.roles)) };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { user: AuthenticatedUser }) {
    const user = await this.users.findById(req.user.id);
    if (!user) throw new UnauthorizedException("الحساب ده مش موجود");
    return toCurrentUser(user, req.user.permissions);
  }
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: [...user.roles],
    branchId: user.branchId,
    isActive: user.isActive,
  };
}

function toCurrentUser(user: User, permissions: ReadonlySet<Permission>) {
  return { ...toPublicUser(user), permissions: [...permissions].sort() };
}
