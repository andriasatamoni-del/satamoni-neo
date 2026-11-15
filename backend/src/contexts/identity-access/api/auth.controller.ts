import { Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards, UseFilters } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { LoginHandler } from "../application/commands/login.handler";
import { USER_REPOSITORY, type UserRepositoryPort } from "../domain/ports/user-repository.port";
import { ROLE_PERMISSION_REPOSITORY, type RoleAccess, type RolePermissionRepositoryPort } from "../domain/ports/role-permission-repository.port";
import { branchScopeOf } from "../../../shared/authorization/branch-scope";
import { User } from "../domain/user.aggregate";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { DomainErrorFilter } from "./filters/domain-error.filter";
import type { AuthenticatedUser } from "./types";

@Controller("auth")
@UseFilters(DomainErrorFilter)
export class AuthController {
  constructor(
    private readonly loginHandler: LoginHandler,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(ROLE_PERMISSION_REPOSITORY) private readonly rolePermissions: RolePermissionRepositoryPort
  ) {}

  @Throttle({ default: { limit: Number(process.env.THROTTLE_LOGIN_LIMIT) || 5, ttl: 60_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto) {
    const { token, user } = await this.loginHandler.execute(dto);
    return { token, user: toCurrentUser(user, await this.rolePermissions.accessForRoles(user.roles)) };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { user: AuthenticatedUser }) {
    const user = await this.users.findById(req.user.id);
    if (!user) throw new UnauthorizedException("الحساب ده مش موجود");
    return toCurrentUser(user, { permissions: new Set(req.user.permissions), scopes: [...req.user.roleScopes], labels: { ...req.user.roleLabels }, fullAccess: req.user.fullAccess });
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

function toCurrentUser(user: User, access: RoleAccess) {
  return {
    ...toPublicUser(user),
    permissions: [...access.permissions].sort(),
    roleLabels: access.labels,
    fullAccess: access.fullAccess,
    companyWide: branchScopeOf({ roleScopes: access.scopes, branchId: user.branchId }).kind === "all",
  };
}
