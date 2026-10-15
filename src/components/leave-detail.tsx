"use client";

import { useState } from "react";
import { Check, ChevronLeft, History, X } from "lucide-react";
import { ApiFeedback } from "@/components/api-feedback";
import { Drawer, FormField, inputClass } from "@/components/hrm-ui";
import { formatDate } from "@/lib/hrm-format";
import {
  canReviewLeave,
  leaveDateTime,
  leaveStatusLabel,
  validateRejection,
  type LeaveDetail,
} from "@/lib/leave-requests";
import type { CurrentUser } from "@/lib/hrm-api";

export function LeaveBadge({ status }: { status: string }) {
  const tone =
    status === "PENDING"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "APPROVED"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : status === "REJECTED"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {leaveStatusLabel(status)}
    </span>
  );
}

export function LeaveDetailContent({ record }: { record: LeaveDetail }) {
  const fields = [
    ["Nhân viên", `${record.employeeName} · ${record.employeeCode}`],
    ["Loại phép", record.leaveTypeName],
    [
      "Thời gian nghỉ",
      `${formatDate(record.startDate)} – ${formatDate(record.endDate)}`,
    ],
    ["Số ngày nghỉ", `${record.requestedDays.toLocaleString("vi-VN")} ngày`],
    ["Ngày gửi", leaveDateTime(record.createdAt)],
    ["Thời điểm xử lý", leaveDateTime(record.reviewedAt || record.cancelledAt)],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{record.requestCode}</p>
        <LeaveBadge status={record.status} />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-border pt-4">
        <p className="mb-1 text-xs text-muted-foreground">Lý do nghỉ</p>
        <p className="whitespace-pre-wrap break-words text-sm">
          {record.reason || "—"}
        </p>
      </div>
      {record.rejectionReason && (
        <div className="border-l-2 border-destructive pl-3">
          <p className="text-xs font-semibold text-destructive">
            Lý do từ chối
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">
            {record.rejectionReason}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LeaveDetailDrawer({
  record,
  loading,
  error,
  user,
  preview,
  onClose,
  onRetry,
  onReviewed,
}: {
  record: LeaveDetail | null;
  loading: boolean;
  error: string;
  user: CurrentUser | null;
  preview: boolean;
  onClose: () => void;
  onRetry: () => void;
  onReviewed: (
    record: LeaveDetail,
    decision: "APPROVED" | "REJECTED",
    reason: string,
  ) => void;
}) {
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const allowed = Boolean(record && canReviewLeave(user, record));
  function prepare() {
    const message = decision === "REJECTED" ? validateRejection(reason) : "";
    setReasonError(message);
    if (!message) setConfirm(true);
  }
  return (
    <Drawer
      title={record ? `Đơn ${record.requestCode}` : "Chi tiết đơn nghỉ phép"}
      onClose={onClose}
    >
      <ApiFeedback error={error} onRetry={onRetry} />
      {loading && (
        <p
          role="status"
          className="py-10 text-center text-sm text-muted-foreground"
        >
          Đang tải chi tiết đơn...
        </p>
      )}
      {record && !loading && !error && (
        <>
          <div
            role="tablist"
            aria-label="Chi tiết đơn"
            className="mb-5 flex border-b border-border"
          >
            {(["detail", "history"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium ${tab === value ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
              >
                {value === "history" && <History className="size-4" />}
                {value === "detail" ? "Thông tin đơn" : "Lịch sử xử lý"}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            aria-label={tab === "detail" ? "Thông tin đơn" : "Lịch sử xử lý"}
          >
            {tab === "detail" ? (
              <LeaveDetailContent record={record} />
            ) : (
              <ol className="space-y-0">
                {record.statusHistory.length ? (
                  [...record.statusHistory]
                    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
                    .map((item, index) => (
                      <li
                        key={`${item.changedAt}-${index}`}
                        className="relative ml-2 border-l border-border pb-6 pl-5"
                      >
                        <span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-white bg-primary" />
                        <p className="text-sm font-semibold">
                          {item.oldStatus
                            ? `${leaveStatusLabel(item.oldStatus)} → `
                            : ""}
                          {leaveStatusLabel(item.newStatus)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.changedByEmployeeName || "Hệ thống"} ·{" "}
                          {leaveDateTime(item.changedAt)}
                        </p>
                        {item.note && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                            {item.note}
                          </p>
                        )}
                      </li>
                    ))
                ) : (
                  <li className="py-8 text-center text-sm text-muted-foreground">
                    Chưa có lịch sử xử lý.
                  </li>
                )}
              </ol>
            )}
          </div>
          {record.status === "PENDING" && (
            <section className="mt-6 border-t border-border pt-4">
              {user?.employee?.id === record.employeeId ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Bạn không được duyệt hoặc từ chối đơn của chính mình.
                </p>
              ) : allowed ? (
                <>
                  {!preview && (
                    <p
                      role="status"
                      className="mb-3 text-sm text-muted-foreground"
                    >
                      Duyệt và từ chối chưa khả dụng.
                    </p>
                  )}
                  {!decision ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={!preview}
                        onClick={() => {
                          setDecision("REJECTED");
                          setReason("");
                          setConfirm(false);
                        }}
                        className="flex h-10 items-center gap-2 rounded-md border border-destructive/30 px-4 text-sm font-medium text-destructive disabled:opacity-40"
                      >
                        <X className="size-4" />
                        Từ chối
                      </button>
                      <button
                        type="button"
                        disabled={!preview}
                        onClick={() => {
                          setDecision("APPROVED");
                          setConfirm(false);
                        }}
                        className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                      >
                        <Check className="size-4" />
                        Duyệt đơn
                      </button>
                    </div>
                  ) : (
                    <form
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!confirm) prepare();
                        else if (preview && allowed) {
                          onReviewed(record, decision, reason.trim());
                          setDecision(null);
                          setConfirm(false);
                        }
                      }}
                    >
                      <h3 className="mb-3 text-base font-semibold">
                        {confirm
                          ? "Xác nhận xử lý đơn"
                          : decision === "REJECTED"
                            ? "Từ chối đơn nghỉ phép"
                            : "Duyệt đơn nghỉ phép"}
                      </h3>
                      {decision === "REJECTED" && !confirm && (
                        <FormField label="Lý do từ chối *" error={reasonError}>
                          <textarea
                            value={reason}
                            onChange={(event) => {
                              setReason(event.target.value);
                              setReasonError("");
                            }}
                            rows={4}
                            maxLength={1000}
                            className={inputClass + " h-auto py-2"}
                          />
                        </FormField>
                      )}
                      {confirm && (
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-muted-foreground">Kết quả</dt>
                            <dd className="font-semibold">
                              {decision === "APPROVED" ? "Đã duyệt" : "Từ chối"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Nhân viên</dt>
                            <dd>{record.employeeName}</dd>
                          </div>
                          {decision === "REJECTED" && (
                            <div>
                              <dt className="text-muted-foreground">
                                Lý do từ chối
                              </dt>
                              <dd className="whitespace-pre-wrap break-words">
                                {reason.trim()}
                              </dd>
                            </div>
                          )}
                        </dl>
                      )}
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            confirm ? setConfirm(false) : setDecision(null)
                          }
                          className="flex h-10 items-center gap-1 rounded-md border border-border px-3 text-sm"
                        >
                          <ChevronLeft className="size-4" />
                          {confirm ? "Quay lại" : "Hủy"}
                        </button>
                        <button
                          type="submit"
                          className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
                        >
                          <Check className="size-4" />
                          {confirm ? "Xác nhận" : "Tiếp tục"}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Bạn không có quyền xử lý đơn này.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
