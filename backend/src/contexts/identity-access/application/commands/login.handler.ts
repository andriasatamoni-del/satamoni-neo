import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { InvalidCredentialsError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { PASSWORD_HASHER, type PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { TOKEN_SERVICE, type TokenServicePort } from "../../domain/ports/token.service.port";
import { AuditLogService } from "../../../../shared/audit/audit-log.service";

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

// تسجيل دخول ناجح/فاشل بيتسجّل في سجل التدقيق صراحة هنا (مش عن طريق AuditLogInterceptor العام) -
// فشل تسجيل الدخول لازم يتسجّل حتى لو الطلب رجع خطأ (الـinterceptor بيسجّل بس عند النجاح)، وده أهم
// حالة أمنيًا أصلًا (محاولات دخول فاشلة متكررة)
@Injectable()
export class LoginHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    private readonly auditLog: AuditLogService
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const user = await this.users.findByEmail(command.email);
    // نفس نمط رسالة "بيانات الدخول غلط" الموحّدة (مش "الإيميل مش موجود" منفصلة عن "الباسورد غلط") -
    // عمدًا عشان محدش يقدر يستنتج إيميلات مسجّلة من رسائل الخطأ المختلفة
    if (!user || !user.isActive) {
      await this.recordFailure(command.email);
      throw new InvalidCredentialsError();
    }

    const valid = await this.hasher.compare(command.password, user.passwordHash);
    if (!valid) {
      await this.recordFailure(command.email);
      throw new InvalidCredentialsError();
    }

    const token = this.tokens.sign({ sub: user.id, role: user.role });
    await this.auditLog.record({ actorUserId: user.id, action: "LOGIN_SUCCEEDED", entityType: "users", entityId: user.id });
    return { token, user };
  }

  private async recordFailure(email: string): Promise<void> {
    await this.auditLog.record({ action: "LOGIN_FAILED", entityType: "users", metadata: { email } });
  }
}
