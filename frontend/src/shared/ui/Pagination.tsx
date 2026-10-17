import { useEffect } from "react";
import { Button } from "./Button";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (page: number) => void;
  /** a newer page is loading (the previous one stays on screen meanwhile) */
  isFetching?: boolean;
}

/** NEO-6: pager for a server-side paginated list (pages are 1-based). */
export function Pagination({ total, limit, offset, onPageChange, isFetching }: PaginationProps) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  // the list shrank under the current page (a filter changed elsewhere, rows were deleted): jump to the last page
  useEffect(() => {
    if (total > 0 && offset >= total) onPageChange(pages);
  }, [total, offset, pages, onPageChange]);

  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>
        عرض {Math.min(offset + 1, total)}–{Math.min(offset + limit, total)} من {total}
        {isFetching ? " · بيحمّل..." : ""}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          السابق
        </Button>
        <span>
          صفحة {page} من {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          التالي
        </Button>
      </div>
    </div>
  );
}
