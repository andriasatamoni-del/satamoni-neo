import { Fragment, useState } from "react";
import { ApiError } from "../shared/api/client";
import { usePaginatedQuery } from "../shared/api/usePaginatedQuery";
import { ListFilters } from "../shared/ui/ListFilters";
import { Pagination } from "../shared/ui/Pagination";
import { useListState } from "../shared/ui/useListState";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Badge } from "../shared/ui/Badge";
import { Button } from "../shared/ui/Button";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface CustomerAddress {
  id: string;
  label: string | null;
  address_details: string;
  distinguishing_mark: string | null;
  area: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  is_default: boolean;
}

interface CustomerRecord {
  id: string;
  phone: string;
  phone2: string | null;
  name: string | null;
  email: string | null;
  address_details: string | null;
  distinguishing_mark: string | null;
  notes: string | null;
  loyalty_points: number;
  is_blocked: boolean;
  block_reason: string | null;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
  first_address: CustomerAddress | null;
}

function addressLine(customer: CustomerRecord): string {
  const address = customer.first_address;
  if (!address) return customer.address_details ?? "-";
  const parts = [
    address.area,
    address.street,
    address.building && `عمارة ${address.building}`,
    address.floor && `دور ${address.floor}`,
    address.apartment && `شقة ${address.apartment}`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join("، ")} - ${address.address_details}` : address.address_details;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-US") : "-";
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">{value === null || value === undefined || value === "" ? "-" : value}</div>
    </div>
  );
}

function CustomerDetails({ customer }: { customer: CustomerRecord }) {
  const address = customer.first_address;
  return (
    <div className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Detail label="الاسم" value={customer.name} />
      <Detail label="الموبايل" value={customer.phone} />
      <Detail label="موبايل تاني" value={customer.phone2} />
      <Detail label="الإيميل" value={customer.email} />
      <Detail label="نقاط الولاء" value={customer.loyalty_points} />
      <Detail label="تاريخ التسجيل" value={formatDate(customer.created_at)} />
      <Detail label="آخر تعديل" value={formatDate(customer.updated_at)} />
      <Detail label="الحالة" value={customer.is_blocked ? `محظور${customer.block_reason ? ` - ${customer.block_reason}` : ""}` : "نشط"} />
      {customer.is_blocked && <Detail label="تاريخ الحظر" value={formatDate(customer.blocked_at)} />}
      <Detail label="ملاحظات" value={customer.notes} />
      <Detail label="العنوان المسجّل على العميل" value={customer.address_details} />
      <Detail label="علامة مميزة" value={address?.distinguishing_mark ?? customer.distinguishing_mark} />
      {address && (
        <>
          <Detail label="اسم العنوان" value={address.label} />
          <Detail label="المنطقة" value={address.area} />
          <Detail label="الشارع" value={address.street} />
          <Detail label="العمارة / الدور / الشقة" value={[address.building, address.floor, address.apartment].filter(Boolean).join(" / ")} />
          <Detail label="تفاصيل العنوان" value={address.address_details} />
          <Detail label="العنوان الافتراضي" value={address.is_default ? "أيوه" : "لأ"} />
        </>
      )}
    </div>
  );
}

export function CustomersPage() {
  const list = useListState(["q", "blocked"] as const);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const customersQuery = usePaginatedQuery<CustomerRecord>(["customers"], "/customers", list.params);

  const notAllowed = customersQuery.isError && customersQuery.error instanceof ApiError && customersQuery.error.status === 403;
  const customers = customersQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader title="العملاء" description="كل العملاء المسجلين وأول عنوان لكل عميل" />

      {notAllowed ? (
        <Card>
          <CardBody>
            <EmptyState>مفيش صلاحية عندك لرؤية العملاء</EmptyState>
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>فلاتر</CardTitle>
            </CardHeader>
            <CardBody>
              <ListFilters
                state={list}
                search={{ placeholder: "الاسم أو الموبايل أو الإيميل" }}
                selects={[
                  { name: "blocked", label: "الحالة", options: [{ value: "false", label: "نشط" }, { value: "true", label: "محظور" }] },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>العملاء ({customersQuery.data?.total ?? 0})</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR><TH>الاسم</TH><TH>الموبايل</TH><TH>أول عنوان</TH><TH>نقاط الولاء</TH><TH>الحالة</TH><TH></TH></TR>
                </THead>
                <TBody>
                  {customers.map((customer) => (
                    <Fragment key={customer.id}>
                      <TR>
                        <TD className="font-semibold text-slate-900">{customer.name ?? "-"}</TD>
                        <TD className="font-mono text-xs">{customer.phone}</TD>
                        <TD>{addressLine(customer)}</TD>
                        <TD>{customer.loyalty_points}</TD>
                        <TD>{customer.is_blocked ? <Badge tone="danger">محظور</Badge> : <Badge tone="success">نشط</Badge>}</TD>
                        <TD>
                          <Button size="sm" variant="ghost" onClick={() => setOpenRowId(openRowId === customer.id ? null : customer.id)}>
                            {openRowId === customer.id ? "إخفاء" : "التفاصيل"}
                          </Button>
                        </TD>
                      </TR>
                      {openRowId === customer.id && (
                        <TR>
                          <TD colSpan={6}>
                            <CustomerDetails customer={customer} />
                          </TD>
                        </TR>
                      )}
                    </Fragment>
                  ))}
                </TBody>
              </Table>
              {customers.length === 0 && !customersQuery.isLoading && <EmptyState>مفيش عملاء مطابقين</EmptyState>}
              <Pagination
                total={customersQuery.data?.total ?? 0}
                limit={list.limit}
                offset={list.offset}
                onPageChange={list.setPage}
                isFetching={customersQuery.isFetching}
              />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
