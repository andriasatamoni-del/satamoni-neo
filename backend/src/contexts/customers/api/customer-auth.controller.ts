import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterCustomerHandler } from "../application/commands/register-customer.handler";
import { LoginCustomerHandler } from "../application/commands/login-customer.handler";
import { AddCustomerAddressHandler } from "../application/commands/add-customer-address.handler";
import { UpdateCustomerProfileHandler } from "../application/commands/update-customer-profile.handler";
import { ManageCustomerAddressHandler } from "../application/commands/manage-customer-address.handler";
import { RegisterCustomerDto } from "./dto/register-customer.dto";
import { LoginCustomerDto } from "./dto/login-customer.dto";
import { AddCustomerAddressDto } from "./dto/add-customer-address.dto";
import { UpdateCustomerProfileDto } from "./dto/update-customer-profile.dto";
import { CustomerAuthGuard } from "./guards/customer-auth.guard";
import { CustomersDomainErrorFilter } from "./filters/domain-error.filter";
import type { Customer, CustomerAddress } from "../domain/customer.aggregate";

// بوابة حساب العميل (المرحلة 8.38 بالريبو القديم) - رقم تليفون + كلمة سر، منفصلة تمامًا عن دخول الموظفين
// (auth.controller.ts): سر توكن مختلف (راجع CustomersModule)، وguard مختلف (CustomerAuthGuard).
// الحساب إلزامي للطلب أونلاين (STORE-2): التسجيل بياخد كل البيانات + أول عنوان مرة واحدة
@Controller("customer-auth")
@UseFilters(CustomersDomainErrorFilter)
export class CustomerAuthController {
  constructor(
    private readonly registerCustomer: RegisterCustomerHandler,
    private readonly loginCustomer: LoginCustomerHandler,
    private readonly addCustomerAddress: AddCustomerAddressHandler,
    private readonly updateProfile: UpdateCustomerProfileHandler,
    private readonly manageAddress: ManageCustomerAddressHandler
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterCustomerDto) {
    const { token, customer } = await this.registerCustomer.execute(dto);
    return { token, customer: toPublicCustomer(customer) };
  }

  @Post("login")
  async login(@Body() dto: LoginCustomerDto) {
    const { token, customer } = await this.loginCustomer.execute(dto);
    return { token, customer: toPublicCustomer(customer) };
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me")
  async me(@Req() req: Request & { customer: Customer }) {
    return toPublicCustomer(req.customer);
  }

  @UseGuards(CustomerAuthGuard)
  @Patch("me")
  async updateMe(@Body() dto: UpdateCustomerProfileDto, @Req() req: Request & { customer: Customer }) {
    return toPublicCustomer(await this.updateProfile.execute(req.customer, dto));
  }

  @UseGuards(CustomerAuthGuard)
  @Get("me/addresses")
  async myAddresses(@Req() req: Request & { customer: Customer }) {
    return req.customer.addresses.map(toPublicAddress);
  }

  @UseGuards(CustomerAuthGuard)
  @Post("me/addresses")
  async addMyAddress(@Body() dto: AddCustomerAddressDto, @Req() req: Request & { customer: Customer }) {
    const { address } = await this.addCustomerAddress.execute({ customerId: req.customer.id, ...dto });
    return toPublicAddress(address);
  }

  @UseGuards(CustomerAuthGuard)
  @Delete("me/addresses/:addressId")
  async removeMyAddress(@Param("addressId", ParseUUIDPipe) addressId: string, @Req() req: Request & { customer: Customer }) {
    return (await this.manageAddress.remove(req.customer, addressId)).addresses.map(toPublicAddress);
  }

  @UseGuards(CustomerAuthGuard)
  @Post("me/addresses/:addressId/default")
  @HttpCode(200)
  async makeDefault(@Param("addressId", ParseUUIDPipe) addressId: string, @Req() req: Request & { customer: Customer }) {
    return (await this.manageAddress.makeDefault(req.customer, addressId)).addresses.map(toPublicAddress);
  }
}

function toPublicCustomer(customer: Customer) {
  return {
    id: customer.id,
    phone: customer.phone,
    phone2: customer.phone2,
    email: customer.email,
    name: customer.name,
    loyaltyPoints: customer.loyaltyPoints,
    // حساب قديم مستورد ناقصه إيميل/رقم تاني/عنوان - الموقع بيطلب يكمّلهم مرة واحدة قبل أول طلب
    missingProfileFields: customer.missingProfileFields,
  };
}

export function toPublicAddress(address: CustomerAddress) {
  return {
    id: address.id,
    label: address.label,
    addressDetails: address.addressDetails,
    area: address.area,
    street: address.street,
    building: address.building,
    floor: address.floor,
    apartment: address.apartment,
    distinguishingMark: address.distinguishingMark,
    isDefault: address.isDefault,
  };
}
