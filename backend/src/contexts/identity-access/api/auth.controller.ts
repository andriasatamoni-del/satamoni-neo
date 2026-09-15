import { Body, Controller, Get, Inject, Post, Req, UnauthorizedException, UseGuards, UseFilters } from "@nestjs/common";
import type { Request } from "express";
import { LoginHandler } from "../application/commands/login.handler";
import { USER_REPOSITORY, type UserRepositoryPort } from "../domain/ports/user-repository.port";
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
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort
  ) {}

  @Post("login")
  async login(@Body() dto: LoginDto) {
    const { token, user } = await this.loginHandler.execute(dto);
    return { token, user: toPublicUser(user) };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { user: AuthenticatedUser }) {
    const user = await this.users.findById(req.user.id);
    if (!user) throw new UnauthorizedException("الحساب ده مش موجود");
    return toPublicUser(user);
  }
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    isActive: user.isActive,
    permissionGrants: user.permissionGrants,
    permissionRevokes: user.permissionRevokes,
  };
}
