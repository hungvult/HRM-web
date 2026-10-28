import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(status) {
    super("API error");
    this.status = status;
  }
}
function moduleAt(path, dependencies = {}, env = {}) {
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports: (dependencies.__exports = {}),
    Date,
    Intl,
    process: { env },
    require: (name) =>
      name in dependencies ? dependencies[name] : require(name),
  });
  return dependencies.__exports;
}
const api = (request = async () => ({}), page = request, env = {}) =>
  moduleAt(
    "../src/lib/notifications.ts",
    {
      "@/lib/api": { apiRequest: request, ApiError },
      "@/lib/hrm-api": { fetchPage: page },
    },
    env,
  );
test("deployed API is enabled by default and can be explicitly disabled", () => {
  assert.equal(api().notificationsApiEnabled, true);
  assert.equal(
    api(undefined, undefined, {
      NEXT_PUBLIC_HRM_NOTIFICATIONS_API_ENABLED: "true",
    }).notificationsApiEnabled,
    true,
  );
  assert.equal(api(undefined, undefined, {
    NEXT_PUBLIC_HRM_NOTIFICATIONS_API_ENABLED: "false",
  }).notificationsApiEnabled, false);
});
test("preview bell without a sample count never enables live requests", () => {
  for (const preview of [false, true]) {
    let enabled;
    const Bell = moduleAt("../src/components/notification-bell.tsx", {
      "@/lib/notifications": api(),
      "@/lib/use-api-resource": {
        useApiResource: (_loader, active) => {
          enabled = active;
          return { data: null, error: "", reload: () => {} };
        },
      },
      "next/link": {
        __esModule: true,
        default: (props) => React.createElement("a", props),
      },
    }).default;
    const html = renderToStaticMarkup(React.createElement(Bell, {
      signedIn: true, preview,
    }));
    assert.equal(enabled, !preview);
    assert.match(html, preview ? /href="\/notifications\?preview=1"/ : /href="\/notifications"/);
  }
});
test("links only support positive safe leave IDs and never remote URLs", () => {
  const client = api();
  assert.equal(
    client.notificationLink({
      relatedEntity: { type: "LEAVE_REQUEST", id: 2 },
    }),
    "/leave-requests/2",
  );
  for (const relatedEntity of [
    null,
    { type: "URL", id: 2 },
    { type: "LEAVE_REQUEST", id: -1 },
    { type: "LEAVE_REQUEST", id: 0 },
    { type: "LEAVE_REQUEST", id: 1.5 },
    { type: "LEAVE_REQUEST", id: "https://evil.invalid" },
  ])
    assert.equal(client.notificationLink({ relatedEntity }), null);
});
test("list is server paginated with cancellation", async () => {
  const signal = new AbortController().signal;
  await api(undefined, async (path, query, actualSignal) => {
    assert.equal(path, "/notifications");
    assert.equal(query.page, 2);
    assert.equal(query.size, 10);
    assert.equal(actualSignal, signal);
  }).fetchNotifications(2, 10, signal);
});
test("detail and read methods match real PR68 contract", async () => {
  const calls = [];
  const client = api(async (path, options) => {
    calls.push({ path, ...options });
  });
  await client.fetchNotification(8);
  await client.readNotification(8);
  await client.readAllNotifications();
  await client.fetchUnreadCount();
  assert.deepEqual(
    calls.map((call) => [call.path, call.method]),
    [
      ["/notifications/8", undefined],
      ["/notifications/8/read", "PATCH"],
      ["/notifications/read-all", "PATCH"],
      ["/notifications/unread-count", undefined],
    ],
  );
  assert.equal(
    calls.every((call) => call.body === undefined),
    true,
  );
});
test("invalid IDs never send a request", async () => {
  let count = 0;
  const client = api(async () => count++);
  for (const id of [0, -1, NaN, 1.5]) {
    await assert.rejects(client.fetchNotification(id), /Mã thông báo/);
    await assert.rejects(client.readNotification(id), /Mã thông báo/);
  }
  assert.equal(count, 0);
});
test("ownership errors do not reveal another recipient", async () => {
  for (const status of [403, 404])
    await assert.rejects(
      api(async () => {
        throw new ApiError(status);
      }).fetchNotification(1),
      /không tồn tại hoặc không thuộc quyền/,
    );
});
test("errors remain Vietnamese for network and expired session", async () => {
  await assert.rejects(
    api(async () => {
      throw new ApiError(401);
    }).fetchUnreadCount(),
    /Phiên đăng nhập/,
  );
  await assert.rejects(
    api(async () => {
      throw new Error("Failed to fetch");
    }).readAllNotifications(),
    /Không thể tải/,
  );
});
test("preview is explicitly forbidden by production server", async () => {
  for (const mode of ["production", "development"]) {
    const Page = moduleAt(
      "../src/app/notifications/page.tsx",
      {
        "@/components/notifications-page": {
          __esModule: true,
          default: () => null,
        },
      },
      { NODE_ENV: mode },
    ).default;
    assert.equal(
      (await Page({ searchParams: Promise.resolve({ preview: "1" }) })).props
        .preview,
      mode === "development",
    );
  }
});
test("list displays both read states without dangerous HTML", () => {
  const preview = moduleAt("../src/lib/notification-preview.ts");
  const rows = preview.createNotificationPreview();
  const notifications = api();
  const components = moduleAt("../src/components/notifications-page.tsx", {
    "@/components/hrm-app-shell": {},
    "@/components/api-feedback": {},
    "@/components/hrm-ui": {},
    "@/lib/hrm-api": {},
    "@/lib/use-api-resource": {},
    "@/lib/notifications": notifications,
    "@/lib/notification-preview": preview,
    "next/link": {
      __esModule: true,
      default: (props) => React.createElement("a", props),
    },
  });
  rows[0].title = "<script>unsafe</script>";
  const html = renderToStaticMarkup(
    React.createElement(components.NotificationRows, {
      rows: rows.slice(0, 4),
      busy: false,
      onOpen: () => {},
    }),
  );
  assert.match(html, /Chưa đọc/);
  assert.match(html, /Đã đọc/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const detail = renderToStaticMarkup(
    React.createElement(components.NotificationContent, {
      item: rows[0],
      preview: true,
    }),
  );
  assert.match(detail, /\/leave-requests\/1\?preview=1/);
  assert.match(detail, /Mở đơn nghỉ phép/);
});
