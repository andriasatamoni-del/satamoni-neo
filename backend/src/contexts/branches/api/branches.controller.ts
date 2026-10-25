import { Body, Controller, Get, Param, Patch, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { RegisterBranchHandler } from "../application/commands/register-branch.handler";
import { UpdateBranchHandler } from "../application/commands/update-branch.handler";
import { ListBranchesHandler } from "../application/queries/list-branches.handler";
import { RegisterBranchDto } from "./dto/register-branch.dto";
import { UpdateBranchDto } from "./dto/update-branch.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import { BranchesDomainErrorFilter } from "./filters/domain-error.filter";
import type { Branch } from "../domain/branch.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";
import { ListQueryDto, listResponse, pageRequestOf } from "../../../shared/http/list-query.dto";

@Controller("branches")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(BranchesDomainErrorFilter)
export class BranchesController {
  constructor(
    private readonly registerBranch: RegisterBranchHandler,
    private readonly updateBranch: UpdateBranchHandler,
    private readonly listBranches: ListBranchesHandler
  ) {}

  @Get()
  @RequirePermission(PERMISSION.BRANCHES_VIEW, PERMISSION.BRANCHES_MANAGE)
  async list(@Query() query: ListQueryDto) {
    const page = pageRequestOf(query);
    const { rows, total } = await this.listBranches.execute(page);
    return listResponse(rows.map(toPublicBranch), total, page);
  }

  @Post()
  @RequirePermission(PERMISSION.BRANCHES_MANAGE)
  async create(@Body() dto: RegisterBranchDto) {
    const branch = await this.registerBranch.execute(dto);
    return toPublicBranch(branch);
  }

  @Patch(":id")
  @RequirePermission(PERMISSION.BRANCHES_MANAGE)
  async update(@Param("id") id: string, @Body() dto: UpdateBranchDto) {
    const branch = await this.updateBranch.execute({ branchId: id, ...dto });
    return toPublicBranch(branch);
  }
}

function toPublicBranch(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    hours: branch.hours,
    lat: branch.lat,
    lng: branch.lng,
    isCentralKitchen: branch.isCentralKitchen,
    supportsDineIn: branch.supportsDineIn,
    talabatBranchId: branch.talabatBranchId,
  };
}
