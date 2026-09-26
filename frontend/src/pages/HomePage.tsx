import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../shared/api/client";
import { useAuth } from "../shared/auth/AuthContext";
import { PageHeader } from "../shared/ui/PageHeader";
import { Button } from "../shared/ui/Button";
import { Input } from "../shared/ui/Field";
import { DashboardSummary } from "./home/DashboardSummary";
import {
  BoxIcon,
  BookIcon,
  BuildingIcon,
  CardIcon,
  CartIcon,
  ClipboardIcon,
  CoinsIcon,
  IdCardIcon,
  TruckIcon,
  UsersIcon,
} from "../shared/ui/icons";

interface HomeTile {
  id: string; tileKey: string; href: string; icon: string; title: string; description: string; displayOrder: number;
}

const ICONS: Record<string, typeof CartIcon> = {
  cart: CartIcon, users: UsersIcon, building: BuildingIcon, box: BoxIcon, book: BookIcon,
  clipboard: ClipboardIcon, truck: TruckIcon, coins: CoinsIcon, card: CardIcon, "id-card": IdCardIcon,
};

// بطاقات اختصار للتنقل - نفس مفهوم home_tiles بالريبو القديم بالظبط (مش KPI/مقاييس حية، بس روابط
// لصفحات تانية). DB-backed دلوقتي بدل ما تكون مصفوفة ثابتة في الكود - الأدمن يقدر يعدّل العنوان/الوصف/
// الترتيب وقت التشغيل (نفس تقييد routes/home-tiles.js بالريبو القديم بالحرف: tileKey/href/icon ثابتين)
export function HomePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const tilesQuery = useQuery({ queryKey: ["home-tiles"], queryFn: () => apiRequest<HomeTile[]>("/home-tiles") });

  const updateTile = useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; description?: string; displayOrder?: number }) =>
      apiRequest(`/home-tiles/${id}`, { method: "PATCH", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["home-tiles"] }),
  });

  return (
    <div>
      <PageHeader title={`أهلاً ${user?.name ?? ""} 👋`} description="اختار من الأقسام تحت عشان تبدأ" />
      <DashboardSummary />

      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" onClick={() => setEditMode((v) => !v)}>
            {editMode ? "خلاص، قفل التعديل" : "تعديل بطاقات الصفحة الرئيسية"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tilesQuery.data?.map((tile) => {
          const TileIcon = ICONS[tile.icon] ?? CartIcon;
          if (editMode) {
            return (
              <div key={tile.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <TileIcon className="h-5 w-5" />
                  </div>
                  <Input
                    defaultValue={tile.title}
                    onBlur={(e) => e.target.value !== tile.title && updateTile.mutate({ id: tile.id, title: e.target.value })}
                    className="text-sm font-bold"
                  />
                </div>
                <Input
                  defaultValue={tile.description}
                  onBlur={(e) => e.target.value !== tile.description && updateTile.mutate({ id: tile.id, description: e.target.value })}
                  className="mb-2 text-xs"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">الترتيب</span>
                  <Input
                    type="number"
                    defaultValue={tile.displayOrder}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== tile.displayOrder) updateTile.mutate({ id: tile.id, displayOrder: n });
                    }}
                    className="w-20"
                  />
                </div>
              </div>
            );
          }
          return (
            <Link
              key={tile.id}
              to={tile.href}
              className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <TileIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tile.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{tile.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
