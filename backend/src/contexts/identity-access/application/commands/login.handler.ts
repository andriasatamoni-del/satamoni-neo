import { Inject, Injectable } from "@nestjs/common";
import { User } from "../../domain/user.aggregate";
import { InvalidCredentialsError } from "../../domain/errors";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user-repository.port";
import { PASSWORD_HASHER, type PasswordHasherPort } from "../../domain/ports/password-hasher.port";
import { TOKEN_SERVICE, type TokenServicePort } from "../../domain/ports/token.service.port";

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: User;
}

@Injectable()
export class LoginHandler {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const user = await this.users.findByEmail(command.email);
    // نفس نمط رسالة "بيانات الدخول غلط" الموحّدة (مش "الإيميل مش موجود" منفصلة عن "الباسورد غلط") -
    // عمدًا عشان محدش يقدر يستنتج إيميلات مسجّلة من رسائل الخطأ المختلفة
    if (!user || !user.isActive) throw new InvalidCredentialsError();

    const valid = await this.hasher.compare(command.password, user.passwordHash);
    if (!valid) throw new InvalidCredentialsError();

    const token = this.tokens.sign({ sub: user.id, role: user.role });
    return { token, user };
  }
}
