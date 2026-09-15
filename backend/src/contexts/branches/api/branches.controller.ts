import { Body, Controller, Get, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
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
  @RequirePermission("branches.view", "branches.manage")
  async list() {
    const branches = await this.listBranches.execute();
    return branches.map(toPublicBranch);
  }

  @Post()
  @RequirePermission("branches.manage")
  async create(@Body() dto: RegisterBranchDto) {
    const branch = await this.registerBranch.execute(dto);
    return toPublicBranch(branch);
  }

  @Patch(":id")
  @RequirePermission("branches.manage")
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
  };
}
