import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, ApiError } from "../shared/api/client";
import { Card, CardBody } from "../shared/ui/Card";
import { Button } from "../shared/ui/Button";

interface OrderRatingItem {
  name: string;
  variant: string | null;
  quantity: number;
}

interface PublicOrderRating {
  orderId: string;
  branchName: string | null;
  orderType: string;
  createdAt: string;
  items: OrderRatingItem[];
  existingRating: { stars: number; comment: string | null } | null;
}

const ORDER_TYPE_LABELS: Record<string, string> = { dinein: "صالة", takeaway: "تيك أواي", delivery: "دليفري" };

// صفحة عامة بدون تسجيل دخول - نفس مفهوم public/rate.html في الريبو القديم بالظبط: مفيش AppShell،
// مفيش auth، اللينك بتوكن الطلب هو التفويض الوحيد (راجع App.tsx - الروت ده مش لافّ في RequireAuth)
export function RateOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? undefined;

  const ratingQuery = useQuery({
    queryKey: ["order-ratings", orderId, token],
    queryFn: () => apiRequest<PublicOrderRating>(`/order-ratings/${orderId}?token=${token}`),
    enabled: Boolean(orderId && token),
    retry: false,
  });

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [hasEdited, setHasEdited] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () => apiRequest(`/order-ratings/${orderId}`, { method: "POST", body: { token, stars, comment } }),
  });

  if (!orderId || !token) {
    return <RatingShell>اللينك ده غير صالح</RatingShell>;
  }

  if (ratingQuery.isLoading) {
    return <RatingShell>بيتم التحميل...</RatingShell>;
  }

  if (ratingQuery.isError) {
    const message = ratingQuery.error instanceof ApiError ? ratingQuery.error.message : "اللينك ده غير صالح";
    return <RatingShell>{message}</RatingShell>;
  }

  const data = ratingQuery.data!;
  const effectiveStars = hasEdited ? stars : (data.existingRating?.stars ?? 0);
  const effectiveComment = hasEdited ? comment : (data.existingRating?.comment ?? "");

  if (submitMutation.isSuccess) {
    return <RatingShell>شكرًا لتقييمك!</RatingShell>;
  }

  return (
    <RatingShell>
      <div className="mb-4 text-center">
        <p className="text-sm text-slate-500">{data.branchName ?? "ساتاموني"}</p>
        <p className="text-xs text-slate-400">
          {ORDER_TYPE_LABELS[data.orderType] ?? data.orderType} · {new Date(data.createdAt).toLocaleString("ar-EG")}
        </p>
      </div>

      <ul className="mb-5 space-y-1 text-sm text-slate-700">
        {data.items.map((item, idx) => (
          <li key={idx} className="flex justify-between">
            <span>
              {item.name}
              {item.variant ? ` - ${item.variant}` : ""}
            </span>
            <span className="text-slate-400">× {item.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="mb-4 flex justify-center gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setStars(n);
              setHasEdited(true);
            }}
            className={`text-3xl leading-none ${n <= effectiveStars ? "text-amber-400" : "text-slate-200"}`}
            aria-label={`${n} نجوم`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={effectiveComment}
        onChange={(e) => {
          setComment(e.target.value);
          setHasEdited(true);
        }}
        placeholder="أي ملاحظات؟ (اختياري)"
        rows={3}
        className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
      />

      {submitMutation.isError && (
        <p className="mb-2 text-center text-sm text-red-600">
          {submitMutation.error instanceof ApiError ? submitMutation.error.message : "لازم تختار تقييم من 1 لـ5 نجوم"}
        </p>
      )}

      <Button
        className="w-full justify-center"
        disabled={effectiveStars < 1 || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        {submitMutation.isPending ? "جاري الإرسال..." : "إرسال التقييم"}
      </Button>
    </RatingShell>
  );
}

function RatingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardBody>{children}</CardBody>
      </Card>
    </div>
  );
}
