import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest, ApiError } from "../shared/api/client";

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

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <p><Link to="/">← الرئيسية</Link></p>
      <h1>الفروع</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24, border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h2>إضافة فرع</h2>
        <label>
          الاسم
          <input required value={name} onChange={(e) => setName(e.target.value)} style={{ display: "block", width: "100%", padding: 6 }} />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          العنوان
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={{ display: "block", width: "100%", padding: 6 }} />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={createBranch.isPending} style={{ padding: "8px 16px", marginTop: 8 }}>
          إضافة
        </button>
      </form>

      {branchesQuery.isLoading && <p>بيتحمّل...</p>}
      <ul>
        {branchesQuery.data?.map((b) => (
          <li key={b.id}>
            <strong>{b.name}</strong> {b.address ? `— ${b.address}` : ""} {b.isCentralKitchen ? "(سنتر كيتشن)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
