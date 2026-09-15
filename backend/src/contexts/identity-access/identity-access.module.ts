import { Module, OnModuleInit } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PermissionRegistry } from "../../shared/permissions/permission-registry";
import { USER_REPOSITORY } from "./domain/ports/user-repository.port";
import { PASSWORD_HASHER } from "./domain/ports/password-hasher.port";
import { TOKEN_SERVICE } from "./domain/ports/token.service.port";
import { KyselyUserRepository } from "./infrastructure/persistence/kysely-user.repository";
import { BcryptPasswordHasher } from "./infrastructure/security/bcrypt-password-hasher";
import { JwtTokenService } from "./infrastructure/security/jwt-token.service";
import { RegisterUserHandler } from "./application/commands/register-user.handler";
import { LoginHandler } from "./application/commands/login.handler";
import { UpdateUserHandler } from "./application/commands/update-user.handler";
import { ListUsersHandler } from "./application/queries/list-users.handler";
import { GetPermissionsCatalogHandler } from "./application/queries/get-permissions-catalog.handler";
import { AuthController } from "./api/auth.controller";
import { UsersController } from "./api/users.controller";
import { JwtAuthGuard } from "./api/guards/jwt-auth.guard";
import { PermissionsGuard } from "./api/guards/permissions.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "12h" },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    RegisterUserHandler,
    LoginHandler,
    UpdateUserHandler,
    ListUsersHandler,
    GetPermissionsCatalogHandler,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [USER_REPOSITORY, TOKEN_SERVICE, JwtAuthGuard, PermissionsGuard],
})
export class IdentityAccessModule implements OnModuleInit {
  constructor(private readonly permissions: PermissionRegistry) {}

  // كل context بيسجّل صلاحياته هو بس وقت الإقلاع - راجع تعليق PermissionRegistry
  onModuleInit(): void {
    this.permissions.registerGroup({
      group: "identity",
      groupLabel: "الهوية والوصول",
      permissions: [
        { key: "identity.users.view", label: "رؤية قائمة المستخدمين" },
        { key: "identity.users.manage", label: "إدارة المستخدمين (إنشاء/تعديل)" },
      ],
    });
    this.permissions.setRoleDefaults("branch_manager", ["identity.users.view"]);
  }
}
