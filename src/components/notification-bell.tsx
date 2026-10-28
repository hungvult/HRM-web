"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { useApiResource } from "@/lib/use-api-resource";
import { fetchUnreadCount, notificationsApiEnabled } from "@/lib/notifications";

export default function NotificationBell({
  signedIn,
  previewCount,
  preview = false,
}: {
  signedIn: boolean;
  previewCount?: number;
  preview?: boolean;
}) {
  const counter = useApiResource(
    fetchUnreadCount,
    signedIn && !preview && notificationsApiEnabled && previewCount === undefined,
  );
  const count = previewCount ?? counter.data?.unreadCount;
  const reload = counter.reload;
  useEffect(() => {
    if (!signedIn || preview || !notificationsApiEnabled || previewCount !== undefined)
      return;
    window.addEventListener("hrm-notifications-updated", reload);
    return () =>
      window.removeEventListener("hrm-notifications-updated", reload);
  }, [signedIn, preview, previewCount, reload]);
  return (
    <Link
      href={
        !preview && previewCount === undefined
          ? "/notifications"
          : "/notifications?preview=1"
      }
      aria-label={
        count === undefined ? "Thông báo" : `Thông báo, ${count} chưa đọc`
      }
      title={
        counter.error ? "Không thể tải số thông báo chưa đọc" : "Thông báo"
      }
      className="relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      <Bell className="size-4" />
      {count !== undefined && count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
