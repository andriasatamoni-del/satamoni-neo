import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { RegisterPurchaseHandler } from "../application/commands/register-purchase.handler";
import { EditPurchaseHandler } from "../application/commands/edit-purchase.handler";
import { ConfirmPurchaseHandler } from "../application/commands/confirm-purchase.handler";
import { RejectPurchaseHandler } from "../application/commands/reject-purchase.handler";
import { ListPurchasesHandler } from "../application/queries/list-purchases.handler";
import { GetPurchaseHandler } from "../application/queries/get-purchase.handler";
import { RegisterPurchaseDto } from "./dto/register-purchase.dto";
import { EditPurchaseDto } from "./dto/edit-purchase.dto";
import { RejectPurchaseDto } from "./dto/reject-purchase.dto";
import { JwtAuthGuard } from "../../identity-access/api/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../identity-access/api/guards/permissions.guard";
import { RequirePermission } from "../../identity-access/api/guards/require-permission.decorator";
import type { AuthenticatedUser } from "../../identity-access/api/types";
import { PurchasesDomainErrorFilter } from "./filters/domain-error.filter";
import type { Purchase } from "../domain/purchase.aggregate";

@Controller("purchases")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseFilters(PurchasesDomainErrorFilter)
export class PurchasesController {
  constructor(
    private readonly registerPurchase: RegisterPurchaseHandler,
    private readonly editPurchase: EditPurchaseHandler,
    private readonly confirmPurchase: ConfirmPurchaseHandler,
    private readonly rejectPurchase: RejectPurchaseHandler,
    private readonly listPurchases: ListPurchasesHandler,
    private readonly getPurchase: GetPurchaseHandler
  ) {}

  @Get()
  @RequirePermission("purchases.view", "purchases.view_own_daily")
  async list(
    @Query("branchId") branchId: string | undefined,
    @Query("businessDate") businessDate: string | undefined,
    @Query("status") status: string | undefined,
    @Req() req: Request & { user: AuthenticatedUser }
  ) {
    const scopedBranchId = req.user.role === "cashier" ? req.user.branchId ?? undefined : branchId;
    const purchases = await this.listPurchases.execute({
      branchId: scopedBranchId,
      businessDate: businessDate ? new Date(businessDate) : undefined,
      status,
    });
    return purchases.map(toPublicPurchase);
  }

  @Get(":id")
  @RequirePermission("purchases.view", "purchases.view_own_daily")
  async detail(@Param("id") id: string) {
    return toPublicPurchase(await this.getPurchase.execute(id));
  }

  // تسجيل مشترى - الكاشير (دور cashier بس) مقفول بالكامل على فرعه/النهاردة، حالته دايمًا PENDING
  // (محتاج مراجعة عبر /confirm أو /reject) - نفس فلسفة "المرحلة 7K" بالريبو القديم بالحرف. أي دور
  // تاني بيتسجل CONFIRMED مباشرة (يترحّل فورًا لو فيه بنود)
  @Post()
  @RequirePermission("purchases.create", "purchases.create_own_daily")
  async create(@Body() dto: RegisterPurchaseDto, @Req() req: Request & { user: AuthenticatedUser }) {
    const isCashier = req.user.role === "cashier";
    const branchId = isCashier ? req.user.branchId ?? dto.branchId : dto.branchId;
    const businessDate = isCashier ? new Date().toISOString().slice(0, 10) : dto.businessDate;

    return toPublicPurchase(
      await this.registerPurchase.execute({
        branchId,
        businessDate: new Date(businessDate),
        category: dto.category,
        amount: dto.amount,
        notes: dto.notes,
        supplierId: isCashier ? undefined : dto.supplierId,
        supplierDocumentNumber: isCashier ? undefined : dto.supplierDocumentNumber,
        items: dto.items,
        initialStatus: isCashier ? "PENDING" : "CONFIRMED",
        createdBy: req.user.id,
        acknowledgeDuplicate: dto.acknowledgeDuplicate,
      })
    );
  }

  @Patch(":id")
  @RequirePermission("purchases.create", "purchases.edit_own_daily")
  async edit(@Param("id") id: string, @Body() dto: EditPurchaseDto) {
    return toPublicPurchase(await this.editPurchase.execute({ purchaseId: id, ...dto }));
  }

  @Post(":id/confirm")
  @RequirePermission("purchases.review")
  async confirm(@Param("id") id: string, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchase(await this.confirmPurchase.execute({ purchaseId: id, reviewedBy: req.user.id }));
  }

  @Post(":id/reject")
  @RequirePermission("purchases.review")
  async reject(@Param("id") id: string, @Body() dto: RejectPurchaseDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return toPublicPurchase(await this.rejectPurchase.execute({ purchaseId: id, reviewedBy: req.user.id, reason: dto.reason }));
  }
}

function toPublicPurchase(purchase: Purchase) {
  return {
    id: purchase.id,
    branchId: purchase.branchId,
    businessDate: purchase.businessDate,
    category: purchase.category,
    amount: purchase.amount,
    notes: purchase.notes,
    supplierId: purchase.supplierId,
    supplierDocumentNumber: purchase.supplierDocumentNumber,
    status: purchase.status,
    createdBy: purchase.createdBy,
    reviewedBy: purchase.reviewedBy,
    reviewedAt: purchase.reviewedAt,
    rejectionReason: purchase.rejectionReason,
    postedToInventory: purchase.postedToInventory,
    createdAt: purchase.createdAt,
    items: purchase.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };
}
