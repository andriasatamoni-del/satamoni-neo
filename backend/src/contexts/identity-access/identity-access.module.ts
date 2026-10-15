import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { USER_REPOSITORY } from "./domain/ports/user-repository.port";
import { PASSWORD_HASHER } from "./domain/ports/password-hasher.port";
import { TOKEN_SERVICE } from "./domain/ports/token.service.port";
import { ROLE_PERMISSION_REPOSITORY } from "./domain/ports/role-permission-repository.port";
import { UserRepository } from "./infrastructure/persistence/user.repository";
import { RolePermissionRepository } from "./infrastructure/persistence/role-permission.repository";
import { BcryptPasswordHasher } from "./infrastructure/security/bcrypt-password-hasher";
import { JwtTokenService } from "./infrastructure/security/jwt-token.service";
import { RegisterUserHandler } from "./application/commands/register-user.handler";
import { LoginHandler } from "./application/commands/login.handler";
import { UpdateUserHandler } from "./application/commands/update-user.handler";
import { UpdateRolePermissionsHandler } from "./application/commands/update-role-permissions.handler";
import { ListUsersHandler } from "./application/queries/list-users.handler";
import { GetPermissionsCatalogHandler } from "./application/queries/get-permissions-catalog.handler";
import { AuthController } from "./api/auth.controller";
import { UsersController } from "./api/users.controller";
import { RolesController } from "./api/roles.controller";
import { JwtAuthGuard } from "./api/guards/jwt-auth.guard";
import { PermissionsGuard } from "./api/guards/permissions.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "12h" },
    }),
  ],
  controllers: [AuthController, UsersController, RolesController],
  providers: [
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: ROLE_PERMISSION_REPOSITORY, useClass: RolePermissionRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    RegisterUserHandler,
    LoginHandler,
    UpdateUserHandler,
    UpdateRolePermissionsHandler,
    ListUsersHandler,
    GetPermissionsCatalogHandler,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [USER_REPOSITORY, ROLE_PERMISSION_REPOSITORY, TOKEN_SERVICE, JwtAuthGuard, PermissionsGuard],
})
export class IdentityAccessModule {}
