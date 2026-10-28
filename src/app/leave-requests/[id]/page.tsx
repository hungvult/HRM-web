import LeaveManagement from "@/components/leave-management";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const preview =
    process.env.NODE_ENV === "development" && query.preview === "1";
  return (
    <LeaveManagement
      key={id}
      initialId={id}
      preview={preview}
      apiEnabled={process.env.HRM_LEAVE_READ_ENABLED !== "false"}
    />
  );
}
