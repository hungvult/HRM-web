"use client";

import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback } from "@/components/api-feedback";
import { employmentLabels, fetchMyProfile, genderLabels, roleLabels } from "@/lib/hrm-api";
import { formatDate } from "@/lib/hrm-format";
import { useApiResource } from "@/lib/use-api-resource";

/** UC005 chỉ đọc hồ sơ từ phiên hiện tại; người có quyền sửa nhân viên dùng màn quản lý UC004. */
export default function MyProfilePage() {
  const resource = useApiResource(fetchMyProfile);
  const profile = resource.data?.employee;
  // Không nhận ID tùy ý hoặc gọi API ghi khi mở, tải lại hay thoát trang cá nhân.
  const fields = [
    ["Mã nhân viên", profile?.employeeCode], ["Họ tên", profile?.fullName],
    ["Ngày sinh", formatDate(profile?.dateOfBirth)],
    ["Giới tính", profile?.gender ? genderLabels[profile.gender] : undefined],
    ["Email", profile?.email || resource.data?.email], ["Số điện thoại", profile?.phone],
    ["Địa chỉ hiện tại", profile?.address], ["Phòng ban", profile?.department?.name],
    ["Chức vụ", profile?.position?.name], ["Quản lý trực tiếp", profile?.manager?.fullName],
    ["Ngày vào làm", formatDate(profile?.hireDate)],
    ["Trạng thái làm việc", profile ? employmentLabels[profile.employmentStatus] : undefined],
    ["Vai trò hệ thống", resource.data?.roles.map((role) => roleLabels[role] || role).join(", ")],
  ];
  return <HrmAppShell user={resource.data} activeLabel="Thông tin cá nhân" title="Thông tin cá nhân" description="Hồ sơ và thông tin liên hệ">
    <ApiFeedback error={resource.error} onRetry={resource.reload} />
    {resource.loading ? <p role="status">Đang tải thông tin cá nhân...</p> : !resource.error && <>
      {!profile && <ApiFeedback error="Tài khoản chưa được liên kết với hồ sơ nhân viên." />}
      <section className="rounded-md border border-border bg-white shadow-sm" aria-label="Hồ sơ cá nhân">
        <h2 className="border-b border-border p-4 font-display text-lg font-semibold">Thông tin hồ sơ</h2>
        <dl className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
          {fields.map(([label, value]) => <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{value || "Chưa có thông tin"}</dd>
          </div>)}
        </dl>
      </section>
    </>}
  </HrmAppShell>;
}
