import {
  CallHandler,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
  NotFoundException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { eq, getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Request } from "express";
import { map, type Observable } from "rxjs";
import { DATABASE, type Database } from "../database/database.token";
import { pgErrorCode, tableByName } from "../database/transaction-context";
import { AuditLogService } from "../audit/audit-log.service";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";
import { ROLE_SCOPE } from "../../contexts/identity-access/domain/role";

export const BRANCH_SCOPED_KEY = "branch_scoped";
export const BRANCH_RESOURCE_KEY = "branch_resource";
export const BRANCH_LIST_FILTER_KEY = "branch_list_filter";
export const COMPANY_WIDE_ONLY_KEY = "company_wide_only";

export type BranchScope = { kind: "all" } | { kind: "branch"; branchId: string } | { kind: "none" };

export function branchScopeOf(user: Pick<AuthenticatedUser, "roleScopes" | "branchId">): BranchScope {
  if (user.roleScopes.includes(ROLE_SCOPE.COMPANY)) return { kind: "all" };
  if (user.branchId) return { kind: "branch", branchId: user.branchId };
  return { kind: "none" };
}

export function canAccessBranch(scope: BranchScope, branchId: string | null | undefined): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return !!branchId && branchId === scope.branchId;
}

export const CompanyWideOnly = () => SetMetadata(COMPANY_WIDE_ONLY_KEY, true);

export const BranchScoped = () => SetMetadata(BRANCH_SCOPED_KEY, true);

export interface BranchResourceOptions {
  param?: string;
  from?: "params" | "body" | "query";
  column?: string;
  idColumn?: string;
  alsoColumns?: string[];
  through?: { column: string; table: string; branchColumn?: string };
}
const resourceDef = (table: string, opts: BranchResourceOptions = {}) => ({
  table,
  param: opts.param ?? "id",
  from: opts.from ?? "params",
  column: opts.column ?? "branch_id",
  idColumn: opts.idColumn ?? "id",
  through: opts.through,
  alsoColumns: opts.alsoColumns ?? [],
});
export const BranchResource = (table: string, opts: BranchResourceOptions = {}) => SetMetadata(BRANCH_RESOURCE_KEY, [resourceDef(table, opts)]);
export const BranchResources = (...defs: Array<[string, BranchResourceOptions?]>) =>
  SetMetadata(BRANCH_RESOURCE_KEY, defs.map(([t, o]) => resourceDef(t, o)));

export const BranchFilteredList = (field = "branchId") => SetMetadata(BRANCH_LIST_FILTER_KEY, field);

type ScopedRequest = Request & { user?: AuthenticatedUser; branchScope?: BranchScope };

function tableOf(name: string): PgTable {
  const table = tableByName(name);
  if (!table) throw new Error(`invalid BranchResource table: ${name}`);
  return table;
}
function columnOf(table: PgTable, name: string): PgColumn {
  const column = Object.values(getTableColumns(table)).find((c) => c.name === name);
  if (!column) throw new Error(`invalid BranchResource column: ${name}`);
  return column;
}

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLogService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scoped = this.reflector.getAllAndOverride<boolean>(BRANCH_SCOPED_KEY, [context.getHandler(), context.getClass()]);
    const companyWideOnly = this.reflector.getAllAndOverride<boolean>(COMPANY_WIDE_ONLY_KEY, [context.getHandler(), context.getClass()]);
    if (!scoped && !companyWideOnly) return true;

    const req = context.switchToHttp().getRequest<ScopedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException("معندكش صلاحية تعمل الإجراء ده");

    const scope = branchScopeOf(user);
    req.branchScope = scope;
    if (scope.kind === "all") return true;
    if (companyWideOnly) return this.deny(req, "company_wide_only");
    if (scope.kind === "none") return this.deny(req, "no_branch_assigned");

    const supplied = [req.query?.branchId, req.params?.branchId, (req.body as Record<string, unknown> | undefined)?.branchId];
    for (const value of supplied) {
      if (value !== undefined && value !== null && value !== "" && value !== scope.branchId) {
        return this.deny(req, "foreign_branch_id", String(value));
      }
    }
    if (req.query && req.query.branchId === undefined) (req.query as Record<string, unknown>).branchId = scope.branchId;

    const resources =
      this.reflector.get<Array<BranchResourceOptions & { table: string; param: string; from: "params" | "body" | "query"; column: string; idColumn: string }> | undefined>(
        BRANCH_RESOURCE_KEY,
        context.getHandler()
      ) ?? [];
    for (const resource of resources) {
      const source = (resource.from === "body" ? req.body : resource.from === "query" ? req.query : req.params) as Record<string, unknown> | undefined;
      const id = source?.[resource.param];
      if (typeof id === "string" && id) {
        const ident = /^[a-z_][a-z0-9_]*$/;
        const names = [resource.table, resource.column, resource.idColumn, ...(resource.alsoColumns ?? []), resource.through?.table, resource.through?.column, resource.through?.branchColumn].filter(
          (n): n is string => typeof n === "string"
        );
        if (!names.every((n) => ident.test(n))) throw new Error("invalid BranchResource definition");
        let branchOfResource: unknown;
        let alsoBranches: unknown[] = [];
        let found = false;
        try {
          const table = tableOf(resource.table);
          const idColumn = columnOf(table, resource.idColumn);
          let rows: Array<Record<string, unknown>>;
          if (resource.through) {
            const parent = tableOf(resource.through.table);
            rows = await this.db
              .select({ branch: columnOf(parent, resource.through.branchColumn ?? "branch_id") })
              .from(table)
              .innerJoin(parent, eq(columnOf(parent, "id"), columnOf(table, resource.through.column)))
              .where(eq(idColumn, id))
              .limit(1);
          } else {
            const also = Object.fromEntries((resource.alsoColumns ?? []).map((c, i) => [`also${i}`, columnOf(table, c)]));
            rows = await this.db
              .select({ branch: columnOf(table, resource.column), ...also })
              .from(table)
              .where(eq(idColumn, id))
              .limit(1);
          }
          found = rows.length > 0;
          const row = rows[0] ?? {};
          branchOfResource = row.branch;
          alsoBranches = (resource.alsoColumns ?? []).map((_, i) => row[`also${i}`]);
        } catch (err) {
          if (pgErrorCode(err) !== "22P02") throw err;
          found = false;
        }
        if (found && branchOfResource !== scope.branchId && !alsoBranches.includes(scope.branchId)) {
          await this.audit
            .record({
              actorUserId: user.id,
              action: `DENIED ${req.method} ${req.route?.path ?? req.path}`,
              entityType: resource.table,
              entityId: String(id),
              branchId: user.branchId,
              outcome: "DENIED",
              httpStatus: 404,
              metadata: { reason: "foreign_branch_resource" },
            })
            .catch(() => undefined);
          throw new NotFoundException();
        }
      }
    }
    return true;
  }

  private async deny(req: ScopedRequest, reason: string, requested?: string): Promise<never> {
    await this.audit
      .record({
        actorUserId: req.user?.id ?? null,
        action: `DENIED ${req.method} ${req.route?.path ?? req.path}`,
        entityType: req.path.split("/").filter(Boolean)[0] ?? null,
        branchId: req.user?.branchId ?? null,
        outcome: "DENIED",
        httpStatus: 403,
        metadata: { reason, requestedBranchId: requested ?? null },
      })
      .catch(() => undefined);
    throw new ForbiddenException("معندكش صلاحية على بيانات الفرع ده");
  }
}

@Injectable()
export class BranchListFilterInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const field = this.reflector.get<string | undefined>(BRANCH_LIST_FILTER_KEY, context.getHandler());
    if (!field) return next.handle();
    const req = context.switchToHttp().getRequest<ScopedRequest>();
    return next.handle().pipe(
      map((data: unknown) => {
        const scope = req.branchScope;
        if (!scope || scope.kind === "all") return data;
        const keep = (item: unknown) => scope.kind === "branch" && (item as Record<string, unknown>)?.[field] === scope.branchId;
        if (Array.isArray(data)) return data.filter(keep);
        if (isPageEnvelope(data)) {
          const items = data.items.filter(keep);
          return { ...data, items, total: Math.max(data.total - (data.items.length - items.length), 0) };
        }
        return data;
      })
    );
  }
}

function isPageEnvelope(data: unknown): data is { items: unknown[]; total: number } {
  return typeof data === "object" && data !== null && Array.isArray((data as { items?: unknown }).items) && typeof (data as { total?: unknown }).total === "number";
}

export const CurrentBranchScope = createParamDecorator((_data: unknown, context: ExecutionContext): BranchScope => {
  const req = context.switchToHttp().getRequest<ScopedRequest>();
  if (req.branchScope) return req.branchScope;
  return req.user ? branchScopeOf(req.user) : { kind: "none" };
});

export function scopedBranchId(scope: BranchScope, requested?: string | null): string | undefined {
  if (scope.kind === "all") return requested || undefined;
  if (scope.kind === "branch") return scope.branchId;
  throw new ForbiddenException("معندكش صلاحية على بيانات الفرع ده");
}

export function assertBranchAccess(user: AuthenticatedUser, branchId: string | null | undefined): void {
  if (!canAccessBranch(branchScopeOf(user), branchId)) throw new ForbiddenException("معندكش صلاحية على بيانات الفرع ده");
}

export function requireCompanyWide(user: AuthenticatedUser): void {
  if (branchScopeOf(user).kind !== "all") throw new ForbiddenException("المعلومة دي على مستوى الشركة كلها ومش متاحة لمستخدم مربوط بفرع");
}
