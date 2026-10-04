"use client";

import { CalendarDays } from "lucide-react";
import { useState, type FormEvent } from "react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback } from "@/components/api-feedback";
import { FormField, inputClass } from "@/components/hrm-ui";
import {
  employmentLabels,
  fetchMyProfile,
  genderLabels,
  getErrorMessage,
  roleLabels,
  updateMyProfile,
} from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";
import {
  focusFirstError,
  validateForm,
  type FormErrors,
} from "@/lib/form-validation";

export default function MyProfilePage() {
  const resource = useApiResource(fetchMyProfile);
  const profile = resource.data?.employee;
  const [draft, setDraft] = useState<{ phone: string; address: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const values = draft ?? {
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
  };
  const dirty =
    !!profile &&
    (values.phone !== (profile.phone ?? "") ||
      values.address !== (profile.address ?? ""));
  const readonlyFields = [
    ["Mã nhân viên", profile?.employeeCode],
    ["Họ tên", profile?.fullName],
    ["Ngày sinh", formatDate(profile?.dateOfBirth)],
    ["Giới tính", profile?.gender ? genderLabels[profile.gender] : "-"],
    ["Email", profile?.email || resource.data?.email],
    ["Phòng ban", profile?.department?.name],
    ["Chức vụ", profile?.position?.name],
    ["Quản lý trực tiếp", profile?.manager?.fullName],
    ["Ngày vào làm", formatDate(profile?.hireDate)],
    [
      "Trạng thái làm việc",
      profile ? employmentLabels[profile.employmentStatus] : "-",
    ],
    [
      "Vai trò hệ thống",
      resource.data?.roles.map((role) => roleLabels[role] || role).join(", "),
    ],
  ];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving || resource.loading || !profile) return;
    const next = { phone: values.phone.trim(), address: values.address.trim() };
    const errors = validateForm(event.currentTarget, {
      phone: "Số điện thoại",
      address: "Địa chỉ hiện tại",
    });
    if (!errors.phone && !/^\+?[0-9]{9,15}$/.test(next.phone)) {
      errors.phone =
        "Số điện thoại phải gồm 9 đến 15 chữ số, có thể bắt đầu bằng dấu +.";
    }
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) {
      focusFirstError(event.currentTarget, errors);
      return;
    }
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const saved = await updateMyProfile(next);
      resource.replace(saved);
      setDraft(null);
      setUpdatedAt(
        new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date()),
      );
      setNotice("Đã lưu thông tin cá nhân lên hệ thống.");
    } catch (apiError) {
      setError(getErrorMessage(apiError));
    } finally {
      setSaving(false);
    }
  }
  return (
    <HrmAppShell
      user={resource.data}
      activeLabel="Thông tin cá nhân"
      title="Thông tin cá nhân"
      description="Hồ sơ và thông tin liên hệ"
      actionLabel="Lưu thay đổi"
      actionIcon="save"
      actionForm="profile-form"
      actionDisabled={!dirty || saving || resource.loading || !!resource.error}
    >
      <ApiFeedback error={resource.error} onRetry={resource.reload} />
      {resource.loading ? (
        <p role="status">Đang tải thông tin cá nhân...</p>
      ) : (
        <>
          {!profile && !resource.error && (
            <ApiFeedback error="Tài khoản chưa được liên kết với hồ sơ nhân viên." />
          )}
          <form
            noValidate
            id="profile-form"
            onSubmit={save}
            className="min-w-0 overflow-hidden rounded-md border border-border bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <h2 className="font-display text-lg font-semibold">
                Hồ sơ cá nhân
              </h2>
              {updatedAt && (
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-4" />
                  Cập nhật gần nhất: {updatedAt}
                </span>
              )}
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {readonlyFields.map(([label, value]) => (
                <FormField key={label} label={label || ""}>
                  <input className={inputClass} value={value || "-"} disabled />
                </FormField>
              ))}
              <FormField label="Số điện thoại" error={fieldErrors.phone}>
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className={inputClass}
                  value={values.phone}
                  required
                  maxLength={16}
                  disabled={!profile || saving}
                  onChange={(event) => {
                    setDraft({ ...values, phone: event.target.value });
                    setNotice("");
                    setError("");
                    setFieldErrors((current) => ({ ...current, phone: "" }));
                  }}
                />
              </FormField>
              <div className="md:col-span-2 xl:col-span-3">
                <FormField label="Địa chỉ hiện tại" error={fieldErrors.address}>
                  <textarea
                    name="address"
                    autoComplete="street-address"
                    className={inputClass + " h-auto min-h-24 py-2"}
                    value={values.address}
                    required
                    maxLength={1000}
                    disabled={!profile || saving}
                    onChange={(event) => {
                      setDraft({ ...values, address: event.target.value });
                      setNotice("");
                      setError("");
                      setFieldErrors((current) => ({
                        ...current,
                        address: "",
                      }));
                    }}
                  />
                </FormField>
              </div>
            </div>
            <div className="px-4 pb-4">
              <ApiFeedback error={error} />
            </div>
            <div className="flex justify-end border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft(null);
                  setFieldErrors({});
                  setNotice("");
                  setError("");
                }}
                className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-40"
              >
                Hủy thay đổi
              </button>
            </div>
          </form>
        </>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {saving ? "Đang lưu..." : notice}
      </p>
    </HrmAppShell>
  );
}
