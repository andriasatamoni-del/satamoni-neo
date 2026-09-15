import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterUserHandler } from "../application/commands/register-user.handler";
import { UpdateUserHandler } from "../application/commands/update-user.handler";
import { ListUsersHandler } from "../application/queries/list-users.handler";
import { GetPermissionsCatalogHandler } from "../application/queries/get-permissions-catalog.handler";
import { RegisterUserDto } from "./dto/register-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RequirePermission } from "./guards/require-permission.decorator";
import { DomainErrorFilter } from "./filters/domain-error.filter";
import { toPublicUser } from "./auth.controller";
import type { AuthenticatedUser } from "./types";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(DomainErrorFilter)
export class UsersController {
  constructor(
    private readonly registerUser: RegisterUserHandler,
    private readonly updateUser: UpdateUserHandler,
    private readonly listUsers: ListUsersHandler,
    private readonly getPermissionsCatalog: GetPermissionsCatalogHandler
  ) {}

  @Get("permissions-catalog")
  @RequirePermission("identity.users.manage")
  permissionsCatalog() {
    return this.getPermissionsCatalog.execute();
  }

  @Get()
  @RequirePermission("identity.users.view", "identity.users.manage")
  async list(@Req() req: Request & { user: AuthenticatedUser }, @Query("branchId") branchId?: string) {
    // نفس نطاق GET /api/users في الريبو القديم: أدمن يشوف كل حاجة (أو فرع محدد لو حدده)، أي حد
    // تاني بيتقفل على فرعه هو بس تلقائيًا
    const scopedBranchId = req.user.role === "admin" ? branchId ?? null : req.user.branchId;
    const users = await this.listUsers.execute(scopedBranchId !== null ? { branchId: scopedBranchId } : undefined);
    return users.map(toPublicUser);
  }

  @Post()
  @RequirePermission("identity.users.manage")
  async create(@Body() dto: RegisterUserDto) {
    const user = await this.registerUser.execute(dto);
    return toPublicUser(user);
  }

  @Patch(":id")
  @RequirePermission("identity.users.manage")
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    const user = await this.updateUser.execute({
      userId: id,
      role: dto.role,
      branchId: dto.branchId,
      isActive: dto.isActive,
      permissionKeys: dto.permissions,
    });
    return toPublicUser(user);
  }
}
