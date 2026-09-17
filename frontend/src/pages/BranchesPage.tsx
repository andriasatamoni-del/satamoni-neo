import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { PageHeader } from "../shared/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";
import { Field, Input } from "../shared/ui/Field";
import { Badge } from "../shared/ui/Badge";
import { EmptyState, TBody, TD, TH, THead, TR, Table } from "../shared/ui/Table";

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isCentralKitchen: boolean;
  supportsDineIn: boolean;
}

export function BranchesPage() {
  const queryClient = useQueryClient();
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: () => apiRequest<Branch[]>("/branches") });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createBranch = useMutation({
    mutationFn: () => apiRequest("/branches", { method: "POST", body: { name, address: address || undefined } }),
    onSuccess: () => {
      setName("");
      setAddress("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["branches"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حصل خطأ غير متوقع"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createBranch.mutate();
  }

  const branches = branchesQuery.data ?? [];

  return (
    <div>
      <PageHeader title="الفروع" description="إدارة فروع المطعم" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>إضافة فرع</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="الاسم">
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="العنوان">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
            <Button type="submit" disabled={createBranch.isPending}>إضافة</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>الفروع ({branches.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {branchesQuery.isLoading && <p className="px-5 py-4 text-sm text-slate-400">بيتحمّل...</p>}
          <Table>
            <THead>
              <TR>
                <TH>الاسم</TH>
                <TH>العنوان</TH>
                <TH>النوع</TH>
              </TR>
            </THead>
            <TBody>
              {branches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-semibold text-slate-900">{b.name}</TD>
                  <TD>{b.address ?? "—"}</TD>
                  <TD>
                    <div className="flex gap-1.5">
                      {b.isCentralKitchen && <Badge tone="brand">سنتر كيتشن</Badge>}
                      {b.supportsDineIn && <Badge tone="info">صالة</Badge>}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {branches.length === 0 && !branchesQuery.isLoading && <EmptyState>مفيش فروع لسه</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
