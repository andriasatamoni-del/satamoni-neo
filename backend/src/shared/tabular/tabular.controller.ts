import {
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  ValidationPipe,
  type Type,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../contexts/identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../contexts/identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../contexts/identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";
import type { Permission } from "../../contexts/identity-access/domain/permission";
import { BranchScoped, BranchScopeGuard, CurrentBranchScope, scopedBranchId, type BranchScope } from "../authorization/branch-scope";
import type { TabularAdapter, TabularContext } from "./tabular-adapter";
import { TabularErrorFilter } from "./tabular-error.filter";
import { TabularBranchRequiredError } from "./tabular-errors";
import { TabularExportQueryDto, TabularImportQueryDto, TabularUpload, tabularDownload } from "./tabular-http";
import { TabularService, type UploadedTabularFile } from "./tabular.service";

export interface TabularRoutes {
  path: string;
  adapter: Type<TabularAdapter<any, any, any>>;
  permissions: { export: readonly Permission[]; import: readonly Permission[] };
  branchScoped?: boolean;
  exportQuery?: Type<TabularExportQueryDto>;
}

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

const noDecorator: MethodDecorator = () => undefined;

function controllerName(path: string): string {
  const pascal = path
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `${pascal}TabularController`;
}

export function TabularController(routes: TabularRoutes): Type<unknown> {
  const exportQueryPipe = new ValidationPipe({ whitelist: true, transform: true, expectedType: routes.exportQuery ?? TabularExportQueryDto });
  const importQueryPipe = new ValidationPipe({ whitelist: true, transform: true, expectedType: TabularImportQueryDto });
  const branchScoped = routes.branchScoped ? BranchScoped() : noDecorator;

  const exportContext = (req: AuthenticatedRequest, scope: BranchScope, branchId: string | undefined): TabularContext => ({
    user: req.user,
    branchId: routes.branchScoped ? scopedBranchId(scope, branchId) : undefined,
  });

  const importContext = (req: AuthenticatedRequest, scope: BranchScope, branchId: string | undefined): TabularContext => {
    if (!routes.branchScoped) return { user: req.user, branchId: undefined };
    const scopedBranch = scopedBranchId(scope, branchId);
    if (!scopedBranch) throw new TabularBranchRequiredError();
    return { user: req.user, branchId: scopedBranch };
  };

  @Controller(routes.path)
  @UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
  @UseFilters(TabularErrorFilter)
  class GeneratedTabularController {
    constructor(
      @Inject(routes.adapter) private readonly adapter: TabularAdapter<any, any, any>,
      @Inject(TabularService) private readonly tabular: TabularService
    ) {}

    @branchScoped
    @Get("export")
    @RequirePermission(...routes.permissions.export)
    async export(
      @Query(exportQueryPipe) query: Record<string, unknown>,
      @Req() req: AuthenticatedRequest,
      @CurrentBranchScope() scope: BranchScope
    ): Promise<StreamableFile> {
      const { format, branchId, ...filter } = query as unknown as TabularExportQueryDto & Record<string, unknown>;
      const rows = await this.adapter.exportRows(filter, exportContext(req, scope, branchId));
      return tabularDownload(await this.tabular.export(this.adapter.sheet, rows, format));
    }

    @Get("import-template")
    @RequirePermission(...routes.permissions.import)
    async importTemplate(@Query(exportQueryPipe) query: Record<string, unknown>): Promise<StreamableFile> {
      const { format } = query as unknown as TabularExportQueryDto;
      return tabularDownload(await this.tabular.template(this.adapter.sheet, format));
    }

    @branchScoped
    @Post("import")
    @RequirePermission(...routes.permissions.import)
    @TabularUpload()
    async import(
      @Query(importQueryPipe) query: Record<string, unknown>,
      @UploadedFile() file: UploadedTabularFile | undefined,
      @Req() req: AuthenticatedRequest,
      @CurrentBranchScope() scope: BranchScope
    ) {
      const { dryRun, branchId } = query as unknown as TabularImportQueryDto;
      return this.tabular.import(this.adapter, file, { dryRun, context: importContext(req, scope, branchId) });
    }
  }

  Object.defineProperty(GeneratedTabularController, "name", { value: controllerName(routes.path) });
  return GeneratedTabularController;
}
