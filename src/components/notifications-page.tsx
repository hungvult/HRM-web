"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CheckCheck,
  Mail,
  MailOpen,
  RefreshCcw,
} from "lucide-react";
import HrmAppShell from "@/components/hrm-app-shell";
import { ApiFeedback } from "@/components/api-feedback";
import { Drawer, ListCard, TableFooter } from "@/components/hrm-ui";
import { fetchMyProfile } from "@/lib/hrm-api";
import { useApiResource } from "@/lib/use-api-resource";
import {
  announceNotificationChange,
  fetchNotification,
  fetchNotifications,
  fetchUnreadCount,
  notificationError,
  notificationLink,
  notificationTime,
  notificationsApiEnabled,
  readAllNotifications,
  readNotification,
  type HrmNotification,
} from "@/lib/notifications";
import {
  createNotificationPreview,
  notificationPreviewUser,
} from "@/lib/notification-preview";

export function NotificationRows({
  rows,
  busy,
  onOpen,
}: {
  rows: HrmNotification[];
  busy: boolean;
  onOpen: (item: HrmNotification) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            disabled={busy}
            aria-label={`Xem thông báo: ${item.title}`}
            className={`flex w-full min-w-0 items-start gap-3 p-4 text-left transition hover:bg-muted/50 disabled:cursor-wait ${item.read ? "bg-white" : "bg-primary/5"}`}
          >
            <span
              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-md ${item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
            >
              {item.read ? (
                <MailOpen className="size-4" />
              ) : (
                <Mail className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={`break-words text-sm ${item.read ? "font-medium" : "font-semibold"}`}
                >
                  {item.title}
                </p>
                <span
                  className={`shrink-0 text-xs ${item.read ? "text-muted-foreground" : "font-medium text-primary"}`}
                >
                  {item.read ? "Đã đọc" : "Chưa đọc"}
                </span>
              </div>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {item.content}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {notificationTime(item.createdAt)}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NotificationContent({
  item,
  preview,
}: {
  item: HrmNotification;
  preview: boolean;
}) {
  const link = notificationLink(item);
  return (
    <div className="space-y-4">
      <h3 className="break-words text-base font-semibold">{item.title}</h3>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{notificationTime(item.createdAt)}</span>
        <span>{item.read ? "Đã đọc" : "Chưa đọc"}</span>
      </div>
      <p className="whitespace-pre-wrap break-words border-t border-border pt-4 text-sm">
        {item.content}
      </p>
      {link && (
        <Link
          href={link + (preview ? "?preview=1" : "")}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-primary/30 px-3 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <ArrowUpRight className="size-4" />
          Mở đơn nghỉ phép
        </Link>
      )}
    </div>
  );
}

export default function NotificationsPage({
  preview = false,
}: {
  preview?: boolean;
}) {
  const session = useApiResource(fetchMyProfile, !preview);
  const user = preview ? notificationPreviewUser : session.data;
  const [samples, setSamples] = useState(() =>
    preview ? createNotificationPreview() : [],
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<HrmNotification | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const lock = useRef(false);
  const [attempted, setAttempted] = useState<HrmNotification | null>(null);
  const controller = useRef<AbortController | null>(null);
  const size = 10;
  const active = !preview && notificationsApiEnabled && Boolean(user);
  const loader = useCallback(
    (signal: AbortSignal) => fetchNotifications(page, size, signal),
    [page],
  );
  const list = useApiResource(loader, active);
  const count = useApiResource(fetchUnreadCount, active);
  const rows = preview
    ? samples.slice(page * size, (page + 1) * size)
    : (list.data?.content ?? []);
  const total = preview ? samples.length : (list.data?.totalElements ?? 0);
  const unread = preview
    ? samples.filter((item) => !item.read).length
    : count.data?.unreadCount;
  useEffect(() => () => controller.current?.abort(), []);
  const error = session.error || list.error || count.error;
  function refresh() {
    list.reload();
    count.reload();
    announceNotificationChange();
  }
  async function open(item: HrmNotification) {
    if (lock.current) return;
    setAttempted(item);
    setNotice("");
    setMutationError("");
    setDetailOpen(true);
    if (preview) {
      const updated = {
        ...item,
        read: true,
        readAt: item.readAt || new Date().toISOString(),
      };
      setSamples((previous) =>
        previous.map((record) => (record.id === item.id ? updated : record)),
      );
      setSelected(updated);
      return;
    }
    if (!active) return;
    lock.current = true;
    setBusy(true);
    setDetailLoading(true);
    setSelected(null);
    const request = new AbortController();
    controller.current = request;
    try {
      const record = await fetchNotification(item.id, request.signal);
      if (request.signal.aborted) return;
      setSelected(record);
      if (!record.read) {
        const updated = await readNotification(record.id, request.signal);
        if (!request.signal.aborted) setSelected(updated);
      }
      if (!request.signal.aborted) refresh();
    } catch (error) {
      if (!request.signal.aborted)
        setMutationError(
          error instanceof Error ? error.message : notificationError(error),
        );
    } finally {
      lock.current = false;
      if (!request.signal.aborted) {
        setBusy(false);
        setDetailLoading(false);
      }
    }
  }
  async function readAll() {
    if (lock.current || (!preview && !active)) return;
    lock.current = true;
    setBusy(true);
    setMutationError("");
    setNotice("");
    const request = new AbortController();
    controller.current = request;
    try {
      if (preview) {
        const now = new Date().toISOString();
        setSamples((previous) =>
          previous.map((item) => ({
            ...item,
            read: true,
            readAt: item.readAt || now,
          })),
        );
        setNotice("Đã đánh dấu dữ liệu mẫu là đã đọc. Không gửi lên máy chủ.");
      } else {
        await readAllNotifications(request.signal);
        if (!request.signal.aborted) {
          refresh();
          setNotice("Đã đánh dấu tất cả thông báo là đã đọc.");
        }
      }
      if (!request.signal.aborted) setConfirmAll(false);
    } catch (error) {
      if (!request.signal.aborted)
        setMutationError(
          error instanceof Error ? error.message : notificationError(error),
        );
    } finally {
      lock.current = false;
      if (!request.signal.aborted) setBusy(false);
    }
  }
  return (
    <HrmAppShell
      activeLabel="Thông báo"
      title="Thông báo"
      description="Thông báo cá nhân"
      user={user}
      preview={preview}
      notificationPreviewCount={preview ? unread : undefined}
    >
      {preview && (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Dữ liệu mẫu · Chỉ xem thử local
        </p>
      )}
      {!preview && !notificationsApiEnabled && (
        <p
          role="status"
          className="border-l-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Thông báo chưa khả dụng. Vui lòng quay lại sau.
        </p>
      )}
      <ApiFeedback
        error={error}
        onRetry={() => {
          session.reload();
          refresh();
        }}
      />
      {!detailOpen && !confirmAll && <ApiFeedback error={mutationError} />}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      <ListCard
        title="Thông báo của bạn"
        description={
          unread === undefined
            ? "Số thông báo chưa đọc chưa khả dụng"
            : `${unread} chưa đọc · ${total} thông báo${preview ? " mẫu" : ""}`
        }
        actions={
          <>
            <button
              type="button"
              disabled={busy || !unread || (!preview && !active)}
              onClick={() => {
                setMutationError("");
                setConfirmAll(true);
              }}
              className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-40"
            >
              <CheckCheck className="size-4" />
              <span>Đánh dấu tất cả đã đọc</span>
            </button>
            <button
              type="button"
              disabled={busy || (!preview && !active)}
              onClick={refresh}
              title="Tải lại"
              aria-label="Tải lại"
              className="grid size-10 shrink-0 place-items-center rounded-md border border-border disabled:opacity-40"
            >
              <RefreshCcw className="size-4" />
            </button>
          </>
        }
        footer={
          <TableFooter
            total={total}
            page={page + 1}
            pageSize={size}
            onPage={busy ? () => {} : (value) => setPage(value - 1)}
          />
        }
      >
        {!preview && (session.loading || list.loading) ? (
          <p
            role="status"
            className="py-12 text-center text-sm text-muted-foreground"
          >
            Đang tải thông báo...
          </p>
        ) : error ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Không thể hiển thị thông báo.
          </p>
        ) : !preview && !active ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Danh sách chưa khả dụng.
          </p>
        ) : rows.length ? (
          <NotificationRows rows={rows} busy={busy} onOpen={open} />
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            <Bell className="mx-auto mb-3 size-7" />
            <p className="text-sm">Bạn chưa có thông báo.</p>
          </div>
        )}
      </ListCard>
      {detailOpen && (
        <Drawer
          title="Chi tiết thông báo"
          busy={busy}
          onClose={() => {
            setDetailOpen(false);
            setSelected(null);
            setMutationError("");
          }}
        >
          <ApiFeedback
            error={mutationError}
            onRetry={
              attempted && !busy
                ? () => open(attempted)
                : undefined
            }
          />
          {detailLoading && (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Đang tải nội dung...
            </p>
          )}
          {selected && (
            <NotificationContent item={selected} preview={preview} />
          )}
        </Drawer>
      )}
      {confirmAll && (
        <Drawer
          title="Đánh dấu tất cả đã đọc"
          busy={busy}
          onClose={() => setConfirmAll(false)}
        >
          <ApiFeedback error={mutationError} />
          <p className="text-sm">
            Đánh dấu tất cả thông báo chưa đọc của bạn là đã đọc?
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmAll(false)}
              className="h-10 rounded-md border border-border px-4 text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={readAll}
              className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              <CheckCheck className="size-4" />
              {busy ? "Đang cập nhật..." : "Xác nhận"}
            </button>
          </div>
        </Drawer>
      )}
    </HrmAppShell>
  );
}
