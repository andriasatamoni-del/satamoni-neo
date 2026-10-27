import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { PERMISSION } from "../../identity-access/domain/permission";
import { BranchScopeGuard } from "../../../shared/authorization/branch-scope";
import { pageRequestOf } from "../../../shared/http/list-query.dto";
import { ListCustomersHandler } from "../application/queries/list-customers.handler";
import { SearchCustomersHandler } from "../application/queries/search-customers.handler";
import { RegisterCustomerByStaffHandler } from "../application/commands/register-customer-by-staff.handler";
import { AddCustomerPhoneHandler } from "../application/commands/add-customer-phone.handler";
import { AddCustomerAddressHandler } from "../application/commands/add-customer-address.handler";
import { ListCustomersQueryDto } from "./dto/list-customers-query.dto";
import { SearchCustomersQueryDto } from "./dto/search-customers-query.dto";
import { RegisterCustomerByStaffDto } from "./dto/register-customer-by-staff.dto";
import { CustomerPhoneInputDto } from "./dto/customer-phone-input.dto";
import { AddCustomerAddressDto } from "./dto/add-customer-address.dto";
import { CustomersDomainErrorFilter } from "./filters/domain-error.filter";
import { staffCustomerView } from "./staff-customer.view";

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(CustomersDomainErrorFilter)
export class CustomersController {
  constructor(
    private readonly listCustomers: ListCustomersHandler,
    private readonly searchCustomers: SearchCustomersHandler,
    private readonly registerCustomer: RegisterCustomerByStaffHandler,
    private readonly addPhone: AddCustomerPhoneHandler,
    private readonly addAddress: AddCustomerAddressHandler
  ) {}

  @Get()
  @RequirePermission(PERMISSION.CUSTOMERS_VIEW)
  async list(@Query() query: ListCustomersQueryDto) {
    const page = pageRequestOf({ ...query, paginate: true })!;
    const { rows, total } = await this.listCustomers.execute(
      { q: query.q, blocked: query.blocked, sort: query.sort, order: query.order },
      page
    );
    return { items: rows, total, limit: page.limit, offset: page.offset };
  }

  @Get("lookup")
  @RequirePermission(PERMISSION.CUSTOMERS_VIEW, PERMISSION.CUSTOMERS_MANAGE, PERMISSION.ORDERS_CREATE)
  async lookup(@Query() query: SearchCustomersQueryDto) {
    const found = await this.searchCustomers.execute(query.q);
    return found.map(staffCustomerView);
  }

  @Post()
  @RequirePermission(PERMISSION.CUSTOMERS_MANAGE)
  async register(@Body() dto: RegisterCustomerByStaffDto) {
    return staffCustomerView(await this.registerCustomer.execute(dto));
  }

  @Post(":id/phones")
  @RequirePermission(PERMISSION.CUSTOMERS_MANAGE)
  async addCustomerPhone(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CustomerPhoneInputDto) {
    return staffCustomerView(await this.addPhone.execute({ customerId: id, ...dto }));
  }

  @Post(":id/addresses")
  @RequirePermission(PERMISSION.CUSTOMERS_MANAGE)
  async addCustomerAddress(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AddCustomerAddressDto) {
    const { customer, address } = await this.addAddress.execute({ customerId: id, ...dto });
    return { customer: staffCustomerView(customer), addressId: address.id };
  }
}
