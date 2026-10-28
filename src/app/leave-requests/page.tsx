import LeaveManagement from "@/components/leave-management";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const preview =
    process.env.NODE_ENV === "development" && query.preview === "1";
  return (
    <LeaveManagement
      preview={preview}
      apiEnabled={process.env.HRM_LEAVE_READ_ENABLED !== "false"}
    />
  );
}
