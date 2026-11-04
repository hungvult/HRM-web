"use client";

import { CalendarClock, GitBranch, UserCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ConfirmationDialog, OperationFeedback } from "@/components/operation-dialog";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback, LoadingRow } from "@/components/api-feedback";
import {
  Drawer,
  EmptyRow,
  FilterBar,
  FormActions,
  FormField,
  ListCard,
  RowActions,
  StatisticSummary,
  StatusBadge,
  TableFooter,
  inputClass,
  tableClass,
} from "@/components/hrm-ui";
import {
  canManageHrm,
  createAssignment,
  fetchAll,
  fetchAssignmentDirectory,
  fetchMyProfile,
  getOperationErrorMessage,
  type AssignmentRecord,
  type CatalogRecord,
} from "@/lib/hrm-api";
import { formatDate, matchesSearch } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";

async function loadOptions(signal: AbortSignal) {
  const [departments, positions] = await Promise.all([
    fetchAll<CatalogRecord>("/departments", { status: "ACTIVE" }, signal),
    fetchAll<CatalogRecord>("/positions", { status: "ACTIVE" }, signal),
  ]);
  return { departments, positions };
}
type Mode = "create" | "view" | "edit";
export default function EmployeeAssignmentPage() {
  const session = useApiResource(fetchMyProfile);
  const allowed = canManageHrm(session.data);
  const directory = useApiResource(fetchAssignmentDirectory, allowed);
  const options = useApiResource(loadOptions, allowed);
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    mode: Mode;
    row?: AssignmentRecord;
  } | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [operationError, setOperationError] = useState("");
  const [draft, setDraft] = useState<{ employeeId: number; departmentId: number; positionId: number; managerEmployeeId?: number } | null>(null);
  const writeLock = useRef(false);
  const [requestedEmployeeId, setRequestedEmployeeId] = useState("");
  const openedRequest = useRef("");
  // URL chỉ chọn trước hồ sơ; quyền và sự tồn tại vẫn được kiểm từ dữ liệu API.
  useEffect(() => {
    const timer = setTimeout(() => setRequestedEmployeeId(new URLSearchParams(window.location.search).get("employeeId") || ""), 0);
    return () => clearTimeout(timer);
  }, []);
  const rows = directory.data?.assignments ?? [];
  const employees = useMemo(() => directory.data?.employees ?? [], [directory.data]);
  const current = rows.filter((row) => row.isCurrent);
  const filtered = rows.filter(
    (row) =>
      matchesSearch(query, [
        row.employee.employeeCode,
        row.employee.fullName,
        row.manager?.fullName ?? "",
        row.department.name,
        row.position.name,
      ]) &&
      (!departmentId || String(row.department.id) === departmentId) &&
      (!status || (status === "CURRENT" ? row.isCurrent : !row.isCurrent)),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 8)),
  );
  const loading = session.loading || (allowed && directory.loading);
  const error =
    session.error ||
    (session.data && !allowed
      ? "Bạn không có quyền quản lý phân công nhân viên."
      : directory.error || options.error);
  useEffect(() => {
    if (!allowed || !directory.data || !requestedEmployeeId || openedRequest.current === requestedEmployeeId) return;
    if (!employees.some((employee) => String(employee.id) === requestedEmployeeId)) return;
    // Tạo từ danh sách nhân viên mang đúng employees.id, không lấy accountId hoặc mã E... thay thế.
    const timer = setTimeout(() => { openedRequest.current = requestedEmployeeId; setSelectedEmployeeId(requestedEmployeeId); setDialog({ mode: "create" }); }, 0);
    return () => clearTimeout(timer);
  }, [allowed, directory.data, employees, requestedEmployeeId]);
  const currentAssignment = current.find((row) => row.employee.id === Number(selectedEmployeeId));
  function open(mode: Mode, row?: AssignmentRecord) {
    setDialog({ mode, row });
    setSelectedEmployeeId(row ? String(row.employee.id) : "");
    setFormError("");
    setNotice("");
    setDraft(null);
  }
  function close() {
    if (!saving) {
      setDialog(null);
      setFormError("");
    }
  }
  function reload() {
    directory.reload();
    options.reload();
  }
  // Kiểm bản nháp từ form theo employees.id và danh mục ACTIVE; chưa ghi phân công trước hộp xác nhận.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || dialog.mode === "view" || saving || !allowed) return;
    const data = new FormData(event.currentTarget);
    const employeeId = Number(selectedEmployeeId);
    const nextDepartmentId = Number(data.get("departmentId"));
    const positionId = Number(data.get("positionId"));
    const managerEmployeeId =
      Number(data.get("managerEmployeeId")) || undefined;
    const employee = employees.find((item) => item.id === employeeId);
    setFormError("");
    if (!employee || employee.employmentStatus !== "WORKING") {
      setFormError("Nhân viên phải đang làm việc để được phân công.");
      return;
    }
    if (
      !options.data?.departments.some((item) => item.id === nextDepartmentId) ||
      !options.data.positions.some((item) => item.id === positionId)
    ) {
      setFormError("Phòng ban và chức vụ phải đang hoạt động.");
      return;
    }
    if (
      managerEmployeeId &&
      !employees.some(
        (item) =>
          item.id === managerEmployeeId && item.employmentStatus === "WORKING",
      )
    ) {
      setFormError("Quản lý trực tiếp phải đang làm việc.");
      return;
    }
    const visited = new Set([employeeId]);
    let ancestor = managerEmployeeId;
    while (ancestor) {
      if (visited.has(ancestor)) {
        setFormError("Không được tự quản lý hoặc tạo vòng lặp quản lý.");
        return;
      }
      visited.add(ancestor);
      ancestor = current.find((item) => item.employee.id === ancestor)?.manager
        ?.id;
    }
    // Lưu bản nháp để người dùng xem lại; ở bước này chưa thay đổi employee_assignments.
    setDraft({ employeeId, departmentId: nextDepartmentId, positionId, managerEmployeeId });
  }
  /** Chỉ xác nhận mới POST phân công; lỗi mạng không tự gửi lại để tránh ghi lịch sử hai lần. */
  async function confirmAssignment() {
    if (!draft || !allowed || writeLock.current) return;
    writeLock.current = true;
    setSaving(true);
    try {
      await createAssignment(draft);
      setDraft(null);
      setDialog(null);
      setPage(1);
      setNotice("Đã lưu phân công mới và giữ lại lịch sử.");
      reload();
    } catch (error) {
      setDraft(null);
      setOperationError(getOperationErrorMessage(error));
    } finally {
      writeLock.current = false;
      setSaving(false);
    }
  }
  const stats = [
    {
      label: "Phân công hiện tại",
      value: current.length,
      detail: "Đang có hiệu lực",
      icon: UsersRound,
    },
    {
      label: "Chưa được phân công",
      value: employees.filter(
        (employee) => !current.some((row) => row.employee.id === employee.id),
      ).length,
      detail: "Nhân viên chưa có phân công hiện tại",
      icon: CalendarClock,
    },
    {
      label: "Thiếu quản lý trực tiếp",
      value: current.filter((row) => !row.manager).length,
      detail: "Phân công chưa có người phụ trách",
      icon: UserCheck,
    },
    {
      label: "Lịch sử phân công",
      value: rows.filter((row) => !row.isCurrent).length,
      detail: "Bản ghi đã kết thúc",
      icon: GitBranch,
    },
  ];
  return (
    <HrmAppShell
      user={session.data}
      activeLabel="Phân công nhân viên"
      title="Phân công nhân viên"
      description="Phòng ban, chức vụ và quản lý trực tiếp"
      actionLabel={allowed ? "Tạo phân công" : undefined}
      onAction={() => open("create")}
      actionDisabled={loading || options.loading || saving || !!error}
    >
      <StatisticSummary
        items={stats.map((item) => ({
          ...item,
          value: directory.data ? String(item.value) : "-",
        }))}
      />
      <ApiFeedback
        error={error}
        onRetry={() => {
          session.reload();
          reload();
        }}
      />
      <ListCard
        title="Danh sách phân công"
        description="Phân công hiện tại và lịch sử thay đổi"
        actions={
          <FilterBar
            query={query}
            onQuery={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Tìm nhân viên, quản lý..."
            filters={[
              {
                label: "Mọi phòng ban",
                value: departmentId,
                options: Array.from(
                  new Map(
                    rows.map((row) => [row.department.id, row.department]),
                  ).values(),
                ).map((item) => ({ value: String(item.id), label: item.name })),
                onChange: (value) => {
                  setDepartmentId(value);
                  setPage(1);
                },
              },
              {
                label: "Mọi trạng thái",
                value: status,
                options: [
                  { value: "CURRENT", label: "Hiện tại" },
                  { value: "PAST", label: "Đã kết thúc" },
                ],
                onChange: (value) => {
                  setStatus(value);
                  setPage(1);
                },
              },
            ]}
            onReload={reload}
          />
        }
        footer={
          <TableFooter
            total={filtered.length}
            page={currentPage}
            onPage={setPage}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className={tableClass + " min-w-[1120px]"}>
            <thead className="bg-muted/55 text-xs uppercase text-muted-foreground">
              <tr>
                {[
                  "Nhân viên",
                  "Phòng ban",
                  "Chức vụ",
                  "Quản lý trực tiếp",
                  "Hiệu lực từ",
                  "Trạng thái",
                  "Thao tác",
                ].map((label) => (
                  <th
                    key={label}
                    className={label === "Thao tác" ? "text-right" : ""}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow columns={7} />
              ) : (
                filtered
                  .slice((currentPage - 1) * 8, currentPage * 8)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>
                        <p className="font-semibold">{row.employee.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.employee.employeeCode}
                        </p>
                      </td>
                      <td>{row.department.name}</td>
                      <td>{row.position.name}</td>
                      <td>{row.manager?.fullName || "-"}</td>
                      <td className="whitespace-nowrap">
                        {formatDate(row.effectiveFrom)}
                      </td>
                      <td>
                        <StatusBadge
                          label={row.isCurrent ? "Hiện tại" : "Đã kết thúc"}
                        />
                      </td>
                      <td>
                        <RowActions
                          name={row.employee.employeeCode}
                          onView={() => open("view", row)}
                          onEdit={
                            allowed && row.isCurrent
                              ? () => open("edit", row)
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  ))
              )}
              {!loading && !filtered.length && <EmptyRow columns={7} />}
            </tbody>
          </table>
        </div>
      </ListCard>
      <OperationFeedback message={notice} onClose={() => setNotice("")} />
      <OperationFeedback message={operationError} kind="error" onClose={() => setOperationError("")} />
      {dialog && (
        <Drawer
          title={
            dialog.mode === "create"
              ? "Tạo phân công"
              : dialog.mode === "view"
                ? "Chi tiết phân công"
                : "Điều chỉnh phân công"
          }
          onClose={close}
          busy={saving}
        >
          <form onSubmit={save} className="space-y-4">
            <ApiFeedback error={formError} />
            <fieldset
              disabled={saving || dialog.mode === "view"}
              className="space-y-4"
            >
              {dialog.mode === "view" && dialog.row ? (
                <>
                  {[
                    [
                      "Nhân viên",
                      dialog.row.employee.employeeCode +
                        " - " +
                        dialog.row.employee.fullName,
                    ],
                    ["Phòng ban", dialog.row.department.name],
                    ["Chức vụ", dialog.row.position.name],
                    ["Quản lý trực tiếp", dialog.row.manager?.fullName || "-"],
                    ["Hiệu lực từ", formatDate(dialog.row.effectiveFrom)],
                    ["Hiệu lực đến", formatDate(dialog.row.effectiveTo)],
                    [
                      "Trạng thái",
                      dialog.row.isCurrent ? "Hiện tại" : "Đã kết thúc",
                    ],
                    ["Người phân công", dialog.row.assignedBy?.username || "-"],
                  ].map(([label, value]) => (
                    <FormField key={label} label={label}>
                      <input value={value} disabled className={inputClass} />
                    </FormField>
                  ))}
                </>
              ) : (
                <>
                  <FormField label="Nhân viên">
                    <select
                      name="employeeId"
                      required
                      className={inputClass}
                      value={selectedEmployeeId}
                      onChange={(event) =>
                        setSelectedEmployeeId(event.target.value)
                      }
                      disabled={dialog.mode === "edit"}
                    >
                      <option value="">Chọn nhân viên</option>
                      {employees
                        .filter(
                          (item) =>
                            item.employmentStatus === "WORKING" ||
                            item.id === Number(selectedEmployeeId),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.employeeCode + " - " + item.fullName}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <section className="rounded-md border border-border bg-muted/30 p-3 text-sm" aria-label="Phân công hiện tại">
                    <h3 className="font-semibold">Phân công hiện tại</h3>
                    <p>{currentAssignment ? `${currentAssignment.department.name} / ${currentAssignment.position.name}` : "Chưa được phân công"}</p>
                    {currentAssignment && <p>Quản lý: {currentAssignment.manager?.fullName || "Chưa có quản lý"}</p>}
                  </section>
                  <FormField label="Phòng ban">
                    <select
                      name="departmentId"
                      required
                      className={inputClass}
                      defaultValue={dialog.row?.department.id ?? ""}
                    >
                      <option value="">Chọn phòng ban</option>
                      {options.data?.departments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Chức vụ">
                    <select
                      name="positionId"
                      required
                      className={inputClass}
                      defaultValue={dialog.row?.position.id ?? ""}
                    >
                      <option value="">Chọn chức vụ</option>
                      {options.data?.positions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Quản lý trực tiếp">
                    <select
                      key={selectedEmployeeId}
                      name="managerEmployeeId"
                      className={inputClass}
                      defaultValue={dialog.row?.manager?.id ?? ""}
                    >
                      <option value="">Chưa phân công</option>
                      {employees
                        .filter(
                          (item) =>
                            item.employmentStatus === "WORKING" &&
                            item.id !== Number(selectedEmployeeId),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.fullName + " - " + item.employeeCode}
                          </option>
                        ))}
                    </select>
                  </FormField>
                </>
              )}
            </fieldset>
            <FormActions
              onClose={close}
              readOnly={dialog.mode === "view"}
              busy={saving}
            />
          </form>
        </Drawer>
      )}
      {draft && <ConfirmationDialog title="Xác nhận phân công nhân viên" busy={saving} onClose={() => { if (!writeLock.current) setDraft(null); }} onConfirm={() => void confirmAssignment()}>
        <p>Nhân viên: <strong>{employees.find((employee) => employee.id === draft.employeeId)?.fullName}</strong></p>
        <p>Phòng ban mới: {options.data?.departments.find((item) => item.id === draft.departmentId)?.name}</p>
        <p>Chức vụ mới: {options.data?.positions.find((item) => item.id === draft.positionId)?.name}</p>
        <p>Quản lý mới: {employees.find((employee) => employee.id === draft.managerEmployeeId)?.fullName || "Chưa phân công"}</p>
        <p>Phân công hiện tại: {currentAssignment ? `${currentAssignment.department.name} / ${currentAssignment.position.name} / ${currentAssignment.manager?.fullName || "Chưa có quản lý"}` : "Chưa được phân công"}</p>
      </ConfirmationDialog>}
    </HrmAppShell>
  );
}
