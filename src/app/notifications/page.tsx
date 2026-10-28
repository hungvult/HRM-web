import NotificationsPage from "@/components/notifications-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <NotificationsPage
      preview={process.env.NODE_ENV === "development" && query.preview === "1"}
    />
  );
}
