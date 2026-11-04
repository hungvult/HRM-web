"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Đưa hộp thoại lên native top layer để drawer và vị trí cuộn không che mất nội dung. */
export function OperationDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Native dialog khóa focus; khi đóng chỉ trả focus nếu phần tử cũ vẫn còn trong trang.
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) closeRef.current(); }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-black/40">
    <header className="flex items-start justify-between gap-4 border-b border-border p-5">
      <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
      <button type="button" aria-label="Đóng hộp thoại" onClick={onClose} disabled={busy} className="grid size-8 shrink-0 place-items-center rounded-md border border-border disabled:opacity-50"><X className="size-4" /></button>
    </header>
    <div className="space-y-5 p-5">{children}</div>
  </dialog>;
}

/** Hiển thị kết quả API đã biết; đóng chỉ xóa thông báo, không tự gửi lại request ghi. */
export function OperationFeedback({ message, kind = "success", onClose, action }: {
  message: string; kind?: "success" | "error" | "info"; onClose: () => void;
  action?: { label: string; run: () => void };
}) {
  if (!message) return null;
  const Icon = kind === "success" ? CheckCircle2 : kind === "error" ? CircleAlert : Info;
  return <OperationDialog title={kind === "success" ? "Thành công" : kind === "error" ? "Không thể hoàn tất" : "Thông báo"} onClose={onClose}>
    <div className="flex items-start gap-3">
      <Icon className={"mt-0.5 size-6 shrink-0 " + (kind === "success" ? "text-emerald-600" : kind === "error" ? "text-destructive" : "text-primary")} />
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{message}</p>
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      {action && <button type="button" onClick={action.run} className="h-10 rounded-md border border-border px-4 text-sm font-medium">{action.label}</button>}
      <button type="button" autoFocus onClick={onClose} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Đã hiểu</button>
    </div>
  </OperationDialog>;
}

/** Chỉ Xác nhận gọi hàm ghi của màn; Hủy/đóng giữ nguyên dữ liệu và bản nháp. */
export function ConfirmationDialog({ title, children, onClose, onConfirm, busy = false, label = "Xác nhận" }: {
  title: string; children: ReactNode; onClose: () => void; onConfirm: () => void;
  busy?: boolean; label?: string;
}) {
  return <OperationDialog title={title} onClose={onClose} busy={busy}>
    <div className="space-y-3 text-sm leading-6">{children}</div>
    <div className="flex justify-end gap-2">
      <button type="button" autoFocus disabled={busy} onClick={onClose} className="h-10 rounded-md border border-border px-4 text-sm">Hủy</button>
      <button type="button" disabled={busy} onClick={onConfirm} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Đang xử lý..." : label}</button>
    </div>
  </OperationDialog>;
}
