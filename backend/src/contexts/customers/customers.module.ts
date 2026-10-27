import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CUSTOMER_REPOSITORY } from "./domain/ports/customer-repository.port";
import { CUSTOMER_PASSWORD_HASHER } from "./domain/ports/customer-password-hasher.port";
import { CUSTOMER_TOKEN_SERVICE } from "./domain/ports/customer-token.service.port";
import { CustomerRepository } from "./infrastructure/persistence/customer.repository";
import { BcryptCustomerPasswordHasher } from "./infrastructure/security/bcrypt-customer-password-hasher";
import { JwtCustomerTokenService } from "./infrastructure/security/jwt-customer-token.service";
import { RegisterCustomerHandler } from "./application/commands/register-customer.handler";
import { LoginCustomerHandler } from "./application/commands/login-customer.handler";
import { AddCustomerAddressHandler } from "./application/commands/add-customer-address.handler";
import { UpdateCustomerProfileHandler } from "./application/commands/update-customer-profile.handler";
import { ManageCustomerAddressHandler } from "./application/commands/manage-customer-address.handler";
import { CustomerAuthController } from "./api/customer-auth.controller";
import { CustomerAuthGuard } from "./api/guards/customer-auth.guard";
import { CustomersController } from "./api/customers.controller";
import { ListCustomersHandler } from "./application/queries/list-customers.handler";
import { SearchCustomersHandler } from "./application/queries/search-customers.handler";
import { RegisterCustomerByStaffHandler } from "./application/commands/register-customer-by-staff.handler";
import { AddCustomerPhoneHandler } from "./application/commands/add-customer-phone.handler";
import { IdentityAccessModule } from "../identity-access/identity-access.module";

@Module({
  imports: [
    IdentityAccessModule,
    JwtModule.register({
      secret: `${process.env.JWT_SECRET}::customer`,
      signOptions: { expiresIn: "180d" },
    }),
  ],
  controllers: [CustomerAuthController, CustomersController],
  providers: [
    { provide: CUSTOMER_REPOSITORY, useClass: CustomerRepository },
    { provide: CUSTOMER_PASSWORD_HASHER, useClass: BcryptCustomerPasswordHasher },
    { provide: CUSTOMER_TOKEN_SERVICE, useClass: JwtCustomerTokenService },
    ListCustomersHandler,
    SearchCustomersHandler,
    RegisterCustomerByStaffHandler,
    AddCustomerPhoneHandler,
    RegisterCustomerHandler,
    LoginCustomerHandler,
    AddCustomerAddressHandler,
    UpdateCustomerProfileHandler,
    ManageCustomerAddressHandler,
    CustomerAuthGuard,
  ],
  exports: [CUSTOMER_REPOSITORY, CUSTOMER_TOKEN_SERVICE, CustomerAuthGuard],
})
export class CustomersModule {}
