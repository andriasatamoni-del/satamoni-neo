import { Body, Controller, Get, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ClaimPrintJobHandler } from "../application/commands/claim-print-job.handler";
import { MarkPrintJobPrintedHandler } from "../application/commands/mark-print-job-printed.handler";
import { MarkPrintJobFailedHandler } from "../application/commands/mark-print-job-failed.handler";
import { RetryPrintJobHandler } from "../application/commands/retry-print-job.handler";
import { QueueDeliveryHandoverPrintJobHandler } from "../application/commands/queue-delivery-handover-print-job.handler";
import { QueueDineinBillPrintJobHandler } from "../application/commands/queue-dinein-bill-print-job.handler";
import { ListPrintJobsHandler } from "../application/queries/list-print-jobs.handler";
import { MarkPrintJobFailedDto } from "./dto/mark-print-job-failed.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { BranchScopeGuard, BranchScoped, BranchResource } from "../../../shared/authorization/branch-scope";
import { PrintingDomainErrorFilter } from "./filters/domain-error.filter";
import type { PrintJob } from "../domain/print-job.aggregate";
import { PERMISSION } from "../../identity-access/domain/permission";
import { cappedPage, listResponse, splitListQuery } from "../../../shared/http/list-query.dto";
import { ListPrintJobsQueryDto } from "./dto/list-print-jobs-query.dto";

function toPublicJob(job: PrintJob) {
  return {
    id: job.id, orderId: job.orderId, branchId: job.branchId, printType: job.printType,
    printerId: job.printerId, stationId: job.stationId, status: job.status,
    contentHtml: job.contentHtml, attempts: job.attempts, lastError: job.lastError,
    createdAt: job.createdAt, printingStartedAt: job.printingStartedAt, printedAt: job.printedAt, failedAt: job.failedAt,
  };
}

// الـAPI اللي وكيل الطباعة المحلي بيتعامل معاه بس (نفس فلسفة الريبو القديم: مفيش وصول مباشر لقاعدة
// البيانات من الوكيل خالص، كل حاجة عن طريق الـHTTP API ده بحساب مستخدم حقيقي عادي)
@Controller("printing/print-jobs")
@UseGuards(JwtAuthGuard, PermissionsGuard, BranchScopeGuard)
@UseFilters(PrintingDomainErrorFilter)
export class PrintJobsController {
  constructor(
    private readonly claimPrintJob: ClaimPrintJobHandler,
    private readonly markPrinted: MarkPrintJobPrintedHandler,
    private readonly markFailed: MarkPrintJobFailedHandler,
    private readonly retryPrintJob: RetryPrintJobHandler,
    private readonly queueDeliveryHandover: QueueDeliveryHandoverPrintJobHandler,
    private readonly queueDineinBill: QueueDineinBillPrintJobHandler,
    private readonly listPrintJobs: ListPrintJobsHandler
  ) {}

  @BranchScoped()
  @Get()
  @RequirePermission(PERMISSION.PRINT_JOBS_VIEW, PERMISSION.PRINT_JOBS_MANAGE_QUEUE)
  async list(@Query() query: ListPrintJobsQueryDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const { page, filter } = splitListQuery(query);
    const effectiveBranchId = filter.branchId || req.user.branchId;
    if (!effectiveBranchId) return listResponse([], 0, page);
    // unpaged (the print agent): the oldest `limit` jobs, default 100 and at most 300, as before NEO-6
    const { jobs, total } = await this.listPrintJobs.execute(
      { branchId: effectiveBranchId, status: filter.status, orderId: filter.orderId },
      cappedPage(query, page, 100, 300)
    );
    return listResponse(jobs.map(toPublicJob), total, page);
  }

  @BranchScoped()
  @BranchResource("print_jobs")
  @Post(":id/claim")
  @RequirePermission(PERMISSION.PRINT_JOBS_MANAGE_QUEUE)
  async claim(@Param("id") id: string) {
    return toPublicJob(await this.claimPrintJob.execute({ printJobId: id }));
  }

  @BranchScoped()
  @BranchResource("print_jobs")
  @Post(":id/printed")
  @RequirePermission(PERMISSION.PRINT_JOBS_MANAGE_QUEUE)
  async printed(@Param("id") id: string) {
    return toPublicJob(await this.markPrinted.execute({ printJobId: id }));
  }

  @BranchScoped()
  @BranchResource("print_jobs")
  @Post(":id/failed")
  @RequirePermission(PERMISSION.PRINT_JOBS_MANAGE_QUEUE)
  async failed(@Param("id") id: string, @Body() dto: MarkPrintJobFailedDto) {
    return toPublicJob(await this.markFailed.execute({ printJobId: id, error: dto.error }));
  }

  @BranchScoped()
  @BranchResource("print_jobs")
  @Post(":id/retry")
  @RequirePermission(PERMISSION.PRINT_JOBS_MANAGE_QUEUE)
  async retry(@Param("id") id: string) {
    return toPublicJob(await this.retryPrintJob.execute({ printJobId: id }));
  }

  @BranchScoped()
  @BranchResource("orders", { param: "orderId" })
  @Post("delivery-handover/:orderId")
  @RequirePermission(PERMISSION.ORDERS_MANAGE)
  async deliveryHandover(@Param("orderId") orderId: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicJob(await this.queueDeliveryHandover.execute({ orderId, createdBy: req.user.id }));
  }

  @BranchScoped()
  @BranchResource("orders", { param: "orderId" })
  @Post("dine-in-bill/:orderId")
  @RequirePermission(PERMISSION.ORDERS_VIEW, PERMISSION.ORDERS_CREATE)
  async dineInBill(@Param("orderId") orderId: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicJob(await this.queueDineinBill.execute({ orderId, createdBy: req.user.id }));
  }
}
