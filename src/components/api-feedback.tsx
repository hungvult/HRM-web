"use client";

import { LoaderCircle, RefreshCcw } from "lucide-react";

export function ApiFeedback({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <span>{error}</span>
      {onRetry && (
        <button
          type="button"
          title="Thử lại"
          aria-label="Thử lại"
          onClick={onRetry}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-destructive/20"
        >
          <RefreshCcw className="size-4" />
        </button>
      )}
    </div>
  );
}
export function LoadingRow({ columns }: { columns: number }) {
  return (
    <tr>
      <td colSpan={columns} className="h-32 text-center text-muted-foreground">
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto mb-2 size-6 animate-spin"
        />
        <span role="status">Đang tải dữ liệu...</span>
      </td>
    </tr>
  );
}
