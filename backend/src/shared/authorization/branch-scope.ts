import {
  CallHandler,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
  NotFoundException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Request } from "express";
import { map, type Observable } from "rxjs";
import type { Database } from "../database/database.types";
import { KYSELY } from "../database/kysely.token";
import { AuditLogService } from "../audit/audit-log.service";
import type { AuthenticatedUser } from "../../contexts/identity-access/api/types";

// ---------------------------------------------------------------------------------------------------------------------
// Phase 3.1 (BL-11): server-side branch isolation.
//
// POLICY (documented, enforced here and tested by test/integration/security/branch-isolation.e2e.spec.ts):
//   * Branch scope is derived ONLY from the authenticated user's server-side identity (role + users.branch_id, loaded from the
//     database on every request by JwtAuthGuard). It is NEVER derived from a client-supplied branchId and NEVER from permissions,
//     so granting a custom permission (e.g. accounting.view) can not widen a user's branch scope.
//   * COMPANY-WIDE roles: `admin` and `accountant` see/act on every branch.
//   * `callcenter` is company-wide only when it has no branch assigned; with a branch it is branch-bound.
//   * Every other role (branch_manager, cashier, driver, employee, ...) is BRANCH-BOUND to users.branch_id. A branch-bound user with
//     no branch assigned has NO access to branch-owned data (fail closed).
//   * A branch-bound user supplying a different branchId (query / path / body) gets 403 (and a DENIED audit row); addressing a
//     single resource (by id) that belongs to another branch gets 404 - the record's existence is not revealed.
//   * Collection endpoints are filtered to the user's branch.
// ---------------------------------------------------------------------------------------------------------------------

export const BRANCH_SCOPED_KEY = "branch_scoped";
export const BRANCH_RESOURCE_KEY = "branch_resource";
export const BRANCH_LIST_FILTER_KEY = "branch_list_filter";
export const COMPANY_WIDE_ONLY_KEY = "company_wide_only";

export const COMPANY_WIDE_ROLES: readonly string[] = ["admin", "accountant"];

export type BranchScope = { kind: "all" } | { kind: "branch"; branchId: string } | { kind: "none" };

export function branchScopeOf(user: Pick<AuthenticatedUser, "role" | "branchId">): BranchScope {
  if (COMPANY_WIDE_ROLES.includes(user.role)) return { kind: "all" };
  if (user.role === "callcenter" && !user.branchId) return { kind: "all" };
  if (user.branchId) return { kind: "branch", branchId: user.branchId };
  return { kind: "none" };
}

export function canAccessBranch(scope: BranchScope, branchId: string | null | undefined): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "none") return false;
  return !!branchId && branchId === scope.branchId;
}

/** Company-level data (payroll, supplier balances ...): only company-wide users; branch-bound users get 403 + a DENIED audit row. */
export const CompanyWideOnly = () => SetMetadata(COMPANY_WIDE_ONLY_KEY, true);

/** Marks a controller (or handler) as serving branch-owned data: the BranchScopeGuard enforces the policy above. */
export const BranchScoped = () => SetMetadata(BRANCH_SCOPED_KEY, true);

/** The handler addresses ONE resource by id (`:id` by default) stored in `table` with a branch column. */
export interface BranchResourceOptions {
  /** name of the request field holding the resource id (default `id`) */
  param?: string;
  /** where that field lives (default the URL path) */
  from?: "params" | "body" | "query";
  /** branch column of `table` (default `branch_id`) */
  column?: string;
  /** id column of `table` matched against the request value (default `id`) */
  idColumn?: string;
  /** additional branch columns of the SAME row that also grant access (e.g. a transfer is visible to both its branches) */
  alsoColumns?: string[];
  /** the table has no branch column: resolve the branch through a parent row (`table.column` -> `parent.id`, parent has `parentBranchColumn`) */
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
/** Several resources addressed by one request (e.g. an order AND a driver): every one must belong to the caller's branch. */
export const BranchResources = (...defs: Array<[string, BranchResourceOptions?]>) =>
  SetMetadata(BRANCH_RESOURCE_KEY, defs.map(([t, o]) => resourceDef(t, o)));

/** The handler returns an array of objects carrying a branch id: branch-bound users only receive their own branch's rows. */
export const BranchFilteredList = (field = "branchId") => SetMetadata(BRANCH_LIST_FILTER_KEY, field);

type ScopedRequest = Request & { user?: AuthenticatedUser; branchScope?: BranchScope };

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KYSELY) private readonly db: Kysely<Database>,
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

    // client-supplied branch identifiers can only ever be equal to the user's own branch
    const supplied = [req.query?.branchId, req.params?.branchId, (req.body as Record<string, unknown> | undefined)?.branchId];
    for (const value of supplied) {
      if (value !== undefined && value !== null && value !== "" && value !== scope.branchId) {
        return this.deny(req, "foreign_branch_id", String(value));
      }
    }
    // collection endpoints without an explicit filter are forced onto the user's branch
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
          // to_jsonb(row): identifiers were validated above; reading the columns in JS keeps the SQL free of dynamic fragments
          const res = resource.through
            ? await sql<{ row: Record<string, unknown> }>`
                SELECT to_jsonb(p) AS row
                  FROM ${sql.table(resource.table)} c JOIN ${sql.table(resource.through.table)} p ON p.id = c.${sql.ref(resource.through.column)}
                 WHERE c.${sql.ref(resource.idColumn)} = ${id} LIMIT 1`.execute(this.db)
            : await sql<{ row: Record<string, unknown> }>`
                SELECT to_jsonb(t) AS row FROM ${sql.table(resource.table)} t WHERE t.${sql.ref(resource.idColumn)} = ${id} LIMIT 1`.execute(this.db);
          found = res.rows.length > 0;
          const row = res.rows[0]?.row ?? {};
          branchOfResource = resource.through ? row[resource.through.branchColumn ?? "branch_id"] : row[resource.column];
          alsoBranches = (resource.alsoColumns ?? []).map((c) => row[c]);
        } catch (err) {
          // a malformed id (22P02) is answered 400/404 by the handler/DB layer - nothing to leak; ANY other failure fails closed
          if ((err as { code?: string }).code !== "22P02") throw err;
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
        if (!scope || scope.kind === "all" || !Array.isArray(data)) return data;
        if (scope.kind === "none") return [];
        return data.filter((item) => (item as Record<string, unknown>)?.[field] === scope.branchId);
      })
    );
  }
}

/** Throws 403 unless the user may act on `branchId` (used for branch ids found INSIDE a loaded resource or nested body fields). */
export function assertBranchAccess(user: AuthenticatedUser, branchId: string | null | undefined): void {
  if (!canAccessBranch(branchScopeOf(user), branchId)) throw new ForbiddenException("معندكش صلاحية على بيانات الفرع ده");
}

/** Company-level data (general ledger across branches, payroll, supplier master data ...): branch-bound users are denied. */
export function requireCompanyWide(user: AuthenticatedUser): void {
  if (branchScopeOf(user).kind !== "all") throw new ForbiddenException("المعلومة دي على مستوى الشركة كلها ومش متاحة لمستخدم مربوط بفرع");
}
