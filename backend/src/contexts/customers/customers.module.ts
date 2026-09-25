import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CUSTOMER_REPOSITORY } from "./domain/ports/customer-repository.port";
import { CUSTOMER_PASSWORD_HASHER } from "./domain/ports/customer-password-hasher.port";
import { CUSTOMER_TOKEN_SERVICE } from "./domain/ports/customer-token.service.port";
import { KyselyCustomerRepository } from "./infrastructure/persistence/kysely-customer.repository";
import { BcryptCustomerPasswordHasher } from "./infrastructure/security/bcrypt-customer-password-hasher";
import { JwtCustomerTokenService } from "./infrastructure/security/jwt-customer-token.service";
import { RegisterCustomerHandler } from "./application/commands/register-customer.handler";
import { LoginCustomerHandler } from "./application/commands/login-customer.handler";
import { AddCustomerAddressHandler } from "./application/commands/add-customer-address.handler";
import { CustomerAuthController } from "./api/customer-auth.controller";
import { CustomerAuthGuard } from "./api/guards/customer-auth.guard";

// سر توكن منفصل تمامًا عن توكن الموظفين (JWT_SECRET بتاع IdentityAccessModule) - مشتق من نفس المتغيّر
// الأساسي زي الريبو القديم بالظبط (`${JWT_SECRET}::customer`) عشان يشتغل فورًا من غير أي إعداد إضافي
// على الاستضافة، بس توكن عميل مايتحققش أبدًا بمكتبة الموظفين ولا العكس. جلسة طويلة (180 يوم) - موقع
// طلب عادي، مفيش حساسية زي حساب موظف
@Module({
  imports: [
    JwtModule.register({
      secret: `${process.env.JWT_SECRET}::customer`,
      signOptions: { expiresIn: "180d" },
    }),
  ],
  controllers: [CustomerAuthController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: KyselyCustomerRepository },
    { provide: CUSTOMER_PASSWORD_HASHER, useClass: BcryptCustomerPasswordHasher },
    { provide: CUSTOMER_TOKEN_SERVICE, useClass: JwtCustomerTokenService },
    RegisterCustomerHandler,
    LoginCustomerHandler,
    AddCustomerAddressHandler,
    CustomerAuthGuard,
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
