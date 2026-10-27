"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, RefreshCcw, Search } from "lucide-react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback, LoadingRow } from "@/components/api-feedback";
import {
  EmptyRow,
  FormField,
  ListCard,
  RowActions,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import LeaveDetailDrawer, { LeaveBadge } from "@/components/leave-detail";
import { fetchMyProfile } from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import { announceNotificationChange } from "@/lib/notifications";
import {
  canManageLeave,
  canReviewLeave,
  fetchLeaveDetail,
  fetchLeaveRequests,
  fetchLeaveTypes,
  leaveDateTime,
  leaveLabels,
  leaveTypes,
  reviewLeaveRequest,
  validateLeaveFilters,
  validateRejection,
  type LeaveDetail,
  type LeaveFilters,
} from "@/lib/leave-requests";
import {
  createLeavePreview,
  filterLeavePreview,
  previewLeaveUser,
} from "@/lib/leave-preview";

export default function LeaveManagement({
  preview = false,
  apiEnabled = false,
  initialId,
}: {
  preview?: boolean;
  apiEnabled?: boolean;
  initialId?: string;
}) {
  const session = useApiResource(fetchMyProfile, !preview);
  const [role, setRole] = useState("HR");
  const user = preview ? previewLeaveUser(role) : session.data;
  const allowed = canManageLeave(user);
  const [samples, setSamples] = useState(() =>
    preview ? createLeavePreview() : [],
  );
  const [filters, setFilters] = useState<LeaveFilters>({
    status: "PENDING",
    leaveTypeId: "",
    fromDate: "",
    toDate: "",
    page: 0,
    size: 10,
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(
    initialId ? Number(initialId) : null,
  );
  const [notice, setNotice] = useState("");
  const filterError = validateLeaveFilters(filters);
  const load = useCallback(
    (signal: AbortSignal) => fetchLeaveRequests(filters, signal),
    [filters],
  );
  const resource = useApiResource(
    load,
    !preview && apiEnabled && allowed && !filterError,
  );
  const catalog = useApiResource(
    fetchLeaveTypes,
    !preview && apiEnabled && allowed,
  );
  const types = preview ? leaveTypes : (catalog.data ?? []);
  const loadDetail = useCallback(
    (signal: AbortSignal) => fetchLeaveDetail(selected!, signal),
    [selected],
  );
  // Employees may follow a notification to their own detail; server still enforces ownership.
  const detail = useApiResource(
    loadDetail,
    !preview && apiEnabled && Boolean(user) && selected !== null,
  );
  const previewScope =
    role === "MANAGER"
      ? samples.filter((record) => record.employeeId < 908)
      : role === "EMPLOYEE"
        ? samples.filter((record) => record.employeeId === user?.employee?.id)
        : samples;
  const filtered = filterLeavePreview(previewScope, filters, query);
  const rows = preview
    ? filterError
      ? []
      : filtered.slice(
          filters.page * filters.size,
          (filters.page + 1) * filters.size,
        )
    : (resource.data?.content ?? []);
  const total = preview ? filtered.length : (resource.data?.totalElements ?? 0);
  const previewDetail =
    previewScope.find((record) => record.id === selected) ?? null;
  const selectedRecord = preview ? previewDetail : detail.data;
  const error = preview
    ? !allowed && !initialId
      ? "Bạn không có quyền quản lý đơn nghỉ phép."
      : filterError
    : session.error ||
      (user && !allowed && !initialId
        ? "Bạn không có quyền quản lý đơn nghỉ phép."
        : filterError || resource.error);
  const loading = !preview && (session.loading || resource.loading);
  function changeFilter(key: keyof LeaveFilters, value: string | number) {
    setFilters((current) => ({ ...current, [key]: value, page: 0 }));
  }
  function reset() {
    setFilters({
      status: "PENDING",
      leaveTypeId: "",
      fromDate: "",
      toDate: "",
      page: 0,
      size: 10,
    });
    setQuery("");
  }
  async function review(
    record: LeaveDetail,
    decision: "APPROVED" | "REJECTED",
    reason: string,
    signal: AbortSignal,
  ) {
    if (
      !canReviewLeave(user, record) ||
      (decision === "REJECTED" && validateRejection(reason))
    )
      throw new Error("Không thể xử lý đơn nghỉ phép này.");
    if (!preview) {
      if (!apiEnabled) throw new Error("Dữ liệu nghỉ phép chưa khả dụng.");
      setNotice("");
      await reviewLeaveRequest(record.id, decision, reason, signal);
      if (signal.aborted) return;
      resource.reload();
      detail.reload();
      announceNotificationChange();
      setNotice(
        decision === "APPROVED"
          ? "Đã duyệt đơn nghỉ phép."
          : "Đã từ chối đơn nghỉ phép.",
      );
      return;
    }
    const latest = samples.find((item) => item.id === record.id);
    if (!latest || latest.status !== "PENDING") return;
    const now = new Date().toISOString();
    setSamples((previous) =>
      previous.map((item) =>
        item.id !== record.id
          ? item
          : {
              ...item,
              status: decision,
              rejectionReason: decision === "REJECTED" ? reason : null,
              reviewedAt: now,
              updatedAt: now,
              reviewedByEmployeeId: user!.employee!.id,
              statusHistory: [
                ...item.statusHistory,
                {
                  oldStatus: "PENDING",
                  newStatus: decision,
                  changedByEmployeeId: user!.employee!.id,
                  changedByEmployeeName: user!.employee!.fullName,
                  changedAt: now,
                  note:
                    decision === "REJECTED" ? reason : "Duyệt đơn nghỉ phép",
                },
              ],
            },
      ),
    );
    setNotice(
      "Đã cập nhật dữ liệu mẫu trong phiên xem thử. Không gửi lên máy chủ.",
    );
  }
  return (
    <HrmAppShell
      activeLabel="Nghỉ phép"
      title="Quản lý nghỉ phép"
      description="Đơn nghỉ phép và kết quả xử lý"
      user={user}
      preview={preview}
    >
      {preview && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <span>Dữ liệu mẫu · Chỉ xem thử local</span>
          <label className="flex items-center gap-2">
            <span>Vai trò</span>
            <select
              aria-label="Vai trò xem thử"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setSelected(null);
                reset();
              }}
              className={inputClass + " w-36 bg-white"}
            >
              <option value="HR">HR</option>
              <option value="MANAGER">Quản lý</option>
              <option value="EMPLOYEE">Nhân viên</option>
            </select>
          </label>
        </div>
      )}
      <ApiFeedback
        error={error}
        onRetry={
          !filterError
            ? () => {
                session.reload();
                resource.reload();
              }
            : undefined
        }
      />
      <ApiFeedback error={catalog.error} onRetry={catalog.reload} />
      {notice && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {!preview && !apiEnabled && (
        <p
          role="status"
          className="border-l-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Dữ liệu nghỉ phép chưa khả dụng. Vui lòng quay lại sau.
        </p>
      )}
      {initialId && (
        <Link
          href={preview ? "/leave-requests?preview=1" : "/leave-requests"}
          className="inline-flex items-center gap-2 text-sm text-primary"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
      )}
      {(allowed || !user) && (
        <ListCard
          title="Đơn nghỉ phép"
          description={
            preview
              ? `${total} đơn mẫu`
              : apiEnabled
                ? `${total} đơn`
                : "Chưa có dữ liệu"
          }
          actions={
            <button
              type="button"
              title="Tải lại"
              aria-label="Tải lại"
              onClick={() => {
                resource.reload();
                detail.reload();
              }}
              disabled={!preview && !apiEnabled}
              className="grid size-10 place-items-center rounded-md border border-border disabled:opacity-40"
            >
              <RefreshCcw className="size-4" />
            </button>
          }
          footer={
            <TableFooter
              total={total}
              page={filters.page + 1}
              pageSize={filters.size}
              onPage={(page) =>
                setFilters((current) => ({ ...current, page: page - 1 }))
              }
            />
          }
        >
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="Trạng thái">
              <select
                className={inputClass}
                value={filters.status}
                onChange={(event) => changeFilter("status", event.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                {Object.entries(leaveLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Loại phép">
              <select
                className={inputClass}
                value={filters.leaveTypeId}
                disabled={
                  !preview &&
                  (!apiEnabled || catalog.loading || Boolean(catalog.error))
                }
                onChange={(event) =>
                  changeFilter("leaveTypeId", event.target.value)
                }
              >
                <option value="">Tất cả loại phép</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Từ ngày">
              <input
                type="date"
                value={filters.fromDate}
                onInput={(event) =>
                  changeFilter("fromDate", event.currentTarget.value)
                }
                onChange={(event) =>
                  changeFilter("fromDate", event.target.value)
                }
                className={inputClass}
              />
            </FormField>
            <FormField label="Đến ngày" error={filterError}>
              <input
                type="date"
                value={filters.toDate}
                onInput={(event) =>
                  changeFilter("toDate", event.currentTarget.value)
                }
                onChange={(event) => changeFilter("toDate", event.target.value)}
                className={inputClass}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 items-center gap-3 border-b border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative min-w-0 sm:max-w-80">
              <span className="sr-only">Tìm mã đơn hoặc nhân viên</span>
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                value={query}
                disabled={!preview}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFilters((current) => ({ ...current, page: 0 }));
                }}
                title={
                  !preview ? "Tìm theo nhân viên chưa khả dụng" : undefined
                }
                placeholder="Mã đơn, mã hoặc tên nhân viên"
                className={inputClass + " pl-9"}
              />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                aria-label="Số đơn mỗi trang"
                className={inputClass + " max-w-20 flex-none"}
                value={filters.size}
                onChange={(event) =>
                  changeFilter("size", Number(event.target.value))
                }
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border px-3 text-sm"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="bg-muted/40">
                <tr>
                  <th>Mã đơn</th>
                  <th>Nhân viên</th>
                  <th>Loại phép</th>
                  <th>Thời gian nghỉ</th>
                  <th>Số ngày</th>
                  <th>Trạng thái</th>
                  <th>Ngày gửi</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRow columns={8} />
                ) : error ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Không thể hiển thị danh sách.
                    </td>
                  </tr>
                ) : !preview && !apiEnabled ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Danh sách chưa khả dụng.
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((record) => (
                    <tr key={record.id}>
                      <td className="font-medium">{record.requestCode}</td>
                      <td>
                        <p className="font-medium">{record.employeeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.employeeCode}
                        </p>
                      </td>
                      <td>{record.leaveTypeName}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(record.startDate)}
                        <br />
                        <span className="text-xs text-muted-foreground">
                          đến {formatDate(record.endDate)}
                        </span>
                      </td>
                      <td>{record.requestedDays.toLocaleString("vi-VN")}</td>
                      <td>
                        <LeaveBadge status={record.status} />
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {leaveDateTime(record.createdAt)}
                      </td>
                      <td>
                        <RowActions
                          name={record.requestCode}
                          onView={() => {
                            setNotice("");
                            setSelected(record.id);
                          }}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow columns={8} />
                )}
              </tbody>
            </table>
          </div>
        </ListCard>
      )}
      {selected !== null && (
        <LeaveDetailDrawer
          key={`${selected}-${role}`}
          record={selectedRecord}
          user={user}
          loading={!preview && detail.loading}
          error={
            preview
              ? !previewDetail
                ? "Không tìm thấy đơn nghỉ phép trong phạm vi của bạn."
                : ""
              : !apiEnabled
                ? "Chi tiết đơn nghỉ phép chưa khả dụng."
                : detail.error
          }
          onClose={() => setSelected(null)}
          onRetry={detail.reload}
          onRefresh={() => {
            detail.reload();
            resource.reload();
          }}
          onReviewed={review}
        />
      )}
    </HrmAppShell>
  );
}
