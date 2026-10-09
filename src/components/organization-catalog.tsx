"use client";

import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  UsersRound,
} from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
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
  catalogLabels,
  changeCatalogStatus,
  fetchAll,
  fetchCatalog,
  fetchDepartment,
  fetchPosition,
  fetchMyProfile,
  getErrorMessage,
  saveCatalog,
  type CatalogRecord,
  type EmployeeRecord,
} from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import {
  focusFirstError,
  validateForm,
  type FormErrors,
} from "@/lib/form-validation";

type Mode = "create" | "edit" | "view" | "status";
const blank: CatalogRecord = {
  id: 0,
  code: "",
  name: "",
  description: "",
  status: "ACTIVE",
  createdAt: "",
  updatedAt: "",
  rankLevel: 1,
};
export default function OrganizationCatalog({
  kind,
  localizeValidation = false,
}: {
  kind: "department" | "position";
  localizeValidation?: boolean;
}) {
  const isDepartment = kind === "department";
  const path = isDepartment ? "departments" : "positions";
  const noun = isDepartment ? "phòng ban" : "chức vụ";
  const fieldLabels = {
    code: "Mã " + noun,
    name: "Tên " + noun,
    rankLevel: "Cấp bậc chức vụ",
    description: "Mô tả",
    reason: "Lý do thay đổi",
  };
  const session = useApiResource(fetchMyProfile);
  const allowed = canManageHrm(session.data);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [rankLevel, setRankLevel] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{
    mode: Mode;
    item: CatalogRecord;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState("");
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchCatalog(
        path,
        {
          q: query,
          status,
          rankLevel: isDepartment ? undefined : rankLevel,
          page: page - 1,
          size: 8,
        },
        signal,
      ),
    [path, query, status, rankLevel, isDepartment, page],
  );
  const resource = useApiResource(load, allowed);
  const loadDetail = useCallback(
    (signal: AbortSignal) =>
      isDepartment
        ? fetchDepartment(dialog?.item.id ?? 0, signal)
        : fetchPosition(dialog?.item.id ?? 0, signal),
    [dialog?.item.id, isDepartment],
  );
  const needsDetail = !!dialog && ["view", "edit"].includes(dialog.mode);
  const detail = useApiResource(loadDetail, allowed && needsDetail);
  const item = needsDetail ? (detail.data ?? blank) : (dialog?.item ?? blank);
  const loadStats = useCallback(
    async (signal: AbortSignal) => {
      const [all, active, inactive, employees] = await Promise.all([
        fetchCatalog(path, { size: 1 }, signal),
        fetchCatalog(path, { size: 1, status: "ACTIVE" }, signal),
        fetchCatalog(path, { size: 1, status: "INACTIVE" }, signal),
        fetchAll<EmployeeRecord>("/employees", {}, signal),
      ]);
      const counts: Record<number, number> = {};
      for (const employee of employees) {
        const reference = isDepartment
          ? employee.department
          : employee.position;
        if (reference) counts[reference.id] = (counts[reference.id] || 0) + 1;
      }
      return {
        all: all.totalElements,
        active: active.totalElements,
        inactive: inactive.totalElements,
        counts,
      };
    },
    [path, isDepartment],
  );
  const stats = useApiResource(loadStats, allowed);
  const rows = resource.data?.content ?? [];
  const loading = session.loading || (allowed && resource.loading);
  const pageError =
    session.error ||
    (session.data && !allowed
      ? "Bạn không có quyền quản lý danh mục."
      : resource.error || stats.error);
  function open(mode: Mode, item = blank) {
    setFieldErrors({});
    setError("");
    setNotice("");
    setDialog({ mode, item });
  }
  function close() {
    if (!saving) {
      setDialog(null);
      setFieldErrors({});
      setError("");
    }
  }
  function reload() {
    resource.reload();
    stats.reload();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || saving || !allowed || dialog.mode === "view") return;
    if (needsDetail && (detail.loading || detail.error || !detail.data)) return;
    const errors = localizeValidation
      ? validateForm(event.currentTarget, fieldLabels)
      : {};
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) {
      focusFirstError(event.currentTarget, errors);
      return;
    }
    const form = new FormData(event.currentTarget);
    setError("");
    setSaving(true);
    try {
      if (dialog.mode === "status") {
        await changeCatalogStatus(
          path,
          dialog.item.id,
          dialog.item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
          String(form.get("reason") ?? ""),
        );
      } else {
        await saveCatalog(
          path,
          {
            name: String(form.get("name") ?? ""),
            description: String(form.get("description") ?? ""),
            code:
              isDepartment && dialog.mode === "create"
                ? String(form.get("code") ?? "")
                : undefined,
            rankLevel: isDepartment ? undefined : Number(form.get("rankLevel")),
          },
          dialog.mode === "edit" ? dialog.item.id : undefined,
        );
      }
      setDialog(null);
      setPage(1);
      setNotice("Đã lưu danh mục lên hệ thống.");
      reload();
    } catch (apiError) {
      setError(getErrorMessage(apiError));
    } finally {
      setSaving(false);
    }
  }
  const summary = [
    {
      label: isDepartment ? "Tổng phòng ban" : "Tổng chức vụ",
      value: stats.data ? String(stats.data.all) : "-",
      detail: "Danh mục trong hệ thống",
      icon: isDepartment ? Building2 : BriefcaseBusiness,
    },
    {
      label: "Đang hoạt động",
      value: stats.data ? String(stats.data.active) : "-",
      detail: "Đang có hiệu lực",
      icon: CheckCircle2,
    },
    {
      label: "Vô hiệu hóa",
      value: stats.data ? String(stats.data.inactive) : "-",
      detail: "Giữ lịch sử phân công",
      icon: BriefcaseBusiness,
    },
    {
      label: "Nhân viên đã gán",
      value: stats.data
        ? String(
            Object.values(stats.data.counts).reduce(
              (total, count) => total + count,
              0,
            ),
          )
        : "-",
      detail: "Theo phân công hiện tại",
      icon: UsersRound,
    },
  ];
  return (
    <HrmAppShell
      user={session.data}
      activeLabel={isDepartment ? "Phòng ban" : "Chức vụ"}
      title={"Quản lý " + noun}
      description={"Danh mục và trạng thái " + noun}
      actionLabel={allowed ? "Thêm " + noun : undefined}
      onAction={() => open("create")}
      actionDisabled={loading || saving || !!pageError}
    >
      <StatisticSummary items={summary} />
      <ApiFeedback
        error={pageError}
        onRetry={() => {
          session.reload();
          reload();
        }}
      />
      <ListCard
        title={"Danh sách " + noun}
        description={"Mã, tên và thông tin " + noun}
        actions={
          <FilterBar
            query={query}
            onQuery={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={"Tìm " + noun + "..."}
            filters={[
              {
                label: "Mọi trạng thái",
                value: status,
                options: Object.entries(catalogLabels).map(
                  ([value, label]) => ({ value, label }),
                ),
                onChange: (value) => {
                  setStatus(value);
                  setPage(1);
                },
              },
              ...(!isDepartment
                ? [
                    {
                      label: "Mọi cấp bậc",
                      value: rankLevel,
                      options: Array.from({ length: 10 }, (_, index) => ({
                        value: String(index + 1),
                        label: "Cấp " + (index + 1),
                      })),
                      onChange: (value: string) => {
                        setRankLevel(value);
                        setPage(1);
                      },
                    },
                  ]
                : []),
            ]}
            onReload={reload}
          />
        }
        footer={
          <TableFooter
            total={resource.data?.totalElements ?? 0}
            page={page}
            onPage={setPage}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr className="border-b border-border bg-muted/55 text-[0.68rem] uppercase text-muted-foreground">
                {[
                  "Mã",
                  isDepartment ? "Phòng ban" : "Chức vụ",
                  "Số nhân viên",
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
                <LoadingRow columns={5} />
              ) : (
                rows.map((item) => (
                  <tr key={item.id}>
                    <td className="text-xs font-medium">{item.code}</td>
                    <td className="max-w-80">
                      <p className="font-semibold">{item.name}</p>
                      {!isDepartment && (
                        <p className="mt-1 text-xs">
                          Cấp bậc: {item.rankLevel ?? "-"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.description || "-"}
                      </p>
                    </td>
                    <td>
                      {stats.data ? (stats.data.counts[item.id] ?? 0) : "-"}
                    </td>
                    <td>
                      <StatusBadge label={catalogLabels[item.status]} />
                    </td>
                    <td>
                      <RowActions
                        name={item.name}
                        onView={() => open("view", item)}
                        onEdit={allowed ? () => open("edit", item) : undefined}
                        onStatus={
                          allowed ? () => open("status", item) : undefined
                        }
                        statusLabel={
                          item.status === "ACTIVE" ? "Vô hiệu hóa" : "Kích hoạt"
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
              {!loading && !rows.length && <EmptyRow columns={5} />}
            </tbody>
          </table>
        </div>
      </ListCard>
      <p role="status" className="text-center text-xs text-muted-foreground">
        {notice}
      </p>
      {dialog && (
        <Drawer
          title={
            (dialog.mode === "create"
              ? "Tạo "
              : dialog.mode === "view"
                ? "Chi tiết "
                : dialog.mode === "status"
                  ? dialog.item.status === "ACTIVE"
                    ? "Vô hiệu hóa "
                    : "Kích hoạt "
                  : "Cập nhật ") + noun
          }
          onClose={close}
          busy={saving}
        >
          {needsDetail && detail.loading ? (
            <p role="status">Đang tải thông tin {noun}...</p>
          ) : needsDetail && detail.error ? (
            <ApiFeedback error={detail.error} onRetry={detail.reload} />
          ) : (
            <form
              noValidate={localizeValidation}
              onInputCapture={(event) => {
                const name = (event.target as HTMLInputElement).name;
                if (localizeValidation && fieldErrors[name])
                  setFieldErrors(
                    validateForm(event.currentTarget, fieldLabels),
                  );
              }}
              key={`${kind}-${dialog.mode}-${item.id}`}
              onSubmit={save}
              className="space-y-4"
            >
              <ApiFeedback error={error} />
              <fieldset
                disabled={saving || dialog.mode === "view"}
                className="space-y-4"
              >
                {dialog.mode === "status" ? (
                  <>
                    <p className="font-medium">
                      {item.name} · {item.code}
                    </p>
                    <FormField
                      label="Lý do thay đổi"
                      error={fieldErrors.reason}
                    >
                      <textarea
                        name="reason"
                        maxLength={1000}
                        className={inputClass + " h-24 py-2"}
                      />
                    </FormField>
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField label="Mã" error={fieldErrors.code}>
                        <input
                          name="code"
                          readOnly={!isDepartment || dialog.mode !== "create"}
                          required={isDepartment && dialog.mode === "create"}
                          maxLength={30}
                          className={inputClass}
                          defaultValue={item.code}
                          placeholder={
                            isDepartment ? "Mã phòng ban" : "Tự động sinh"
                          }
                        />
                      </FormField>
                      <FormField label="Tên" error={fieldErrors.name}>
                        <input
                          name="name"
                          required
                          maxLength={150}
                          defaultValue={item.name}
                          className={inputClass}
                        />
                      </FormField>
                    </div>
                    {!isDepartment && (
                      <FormField
                        label="Cấp bậc chức vụ"
                        error={fieldErrors.rankLevel}
                      >
                        <input
                          name="rankLevel"
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          required
                          defaultValue={item.rankLevel ?? 1}
                          className={inputClass}
                        />
                      </FormField>
                    )}
                    <FormField label="Mô tả" error={fieldErrors.description}>
                      <textarea
                        name="description"
                        maxLength={10000}
                        defaultValue={item.description || ""}
                        className={inputClass + " h-28 py-2"}
                      />
                    </FormField>
                    {dialog.mode === "view" && (
                      <>
                        <StatusBadge label={catalogLabels[item.status]} />
                        <p className="text-sm">
                          Số nhân viên:{" "}
                          {stats.data ? (stats.data.counts[item.id] ?? 0) : "-"}
                        </p>
                        <p className="text-sm">
                          Ngày tạo: {formatDate(item.createdAt)}
                        </p>
                        <p className="text-sm">
                          Ngày cập nhật: {formatDate(item.updatedAt)}
                        </p>
                      </>
                    )}
                  </>
                )}
              </fieldset>
              <FormActions
                onClose={close}
                readOnly={dialog.mode === "view"}
                busy={saving}
                primaryLabel={
                  dialog.mode === "status"
                    ? dialog.item.status === "ACTIVE"
                      ? "Vô hiệu hóa"
                      : "Kích hoạt"
                    : "Lưu"
                }
              />
            </form>
          )}
        </Drawer>
      )}
    </HrmAppShell>
  );
}
