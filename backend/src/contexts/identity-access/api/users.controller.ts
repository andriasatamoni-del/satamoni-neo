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
import { hasAnyRole, ROLE } from "../domain/role";
import { PERMISSION } from "../domain/permission";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { listResponse, splitListQuery } from "../../../shared/http/list-query.dto";

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
  @RequirePermission(PERMISSION.IDENTITY_USERS_MANAGE, PERMISSION.IDENTITY_ROLES_MANAGE)
  permissionsCatalog() {
    return this.getPermissionsCatalog.execute();
  }

  @Get()
  @RequirePermission(PERMISSION.IDENTITY_USERS_VIEW, PERMISSION.IDENTITY_USERS_MANAGE)
  async list(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: ListUsersQueryDto) {
    const { page, filter } = splitListQuery(query);
    // نفس نطاق GET /api/users في الريبو القديم: أدمن يشوف كل حاجة (أو فرع محدد لو حدده)، أي حد
    // تاني بيتقفل على فرعه هو بس تلقائيًا
    const scopedBranchId = hasAnyRole(req.user.roles, ROLE.ADMIN) ? filter.branchId ?? null : req.user.branchId;
    const { users, total } = await this.listUsers.execute({ ...filter, branchId: scopedBranchId ?? undefined }, page);
    return listResponse(users.map(toPublicUser), total, page);
  }

  @Post()
  @RequirePermission(PERMISSION.IDENTITY_USERS_MANAGE)
  async create(@Body() dto: RegisterUserDto) {
    const user = await this.registerUser.execute(dto);
    return toPublicUser(user);
  }

  @Patch(":id")
  @RequirePermission(PERMISSION.IDENTITY_USERS_MANAGE)
  async update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    const user = await this.updateUser.execute({
      userId: id,
      roles: dto.roles,
      branchId: dto.branchId,
      isActive: dto.isActive,
      password: dto.password,
    });
    return toPublicUser(user);
  }
}
