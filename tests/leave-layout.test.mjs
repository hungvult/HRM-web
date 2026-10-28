import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function moduleAt(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const sandbox = { exports: {}, Date, Intl, process: { env: {} },
    require: name => name in dependencies ? dependencies[name] : require(name) };
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}

test("P1T-239 reset filter label cannot wrap or shrink into the table header", () => {
  const hrm = moduleAt("../src/lib/hrm-api.ts", { "@/lib/api": {} });
  const format = moduleAt("../src/lib/hrm-format.ts");
  const leave = moduleAt("../src/lib/leave-requests.ts", {
    "@/lib/api": {}, "@/lib/hrm-api": hrm, "@/lib/hrm-format": format,
  });
  const Component = moduleAt("../src/components/leave-management.tsx", {
    "next/link": { __esModule: true, default: ({ children }) => children },
    "@/components/hrm-app-shell": { __esModule: true, default: ({ children }) => children },
    "@/components/api-feedback": { ApiFeedback: () => null, LoadingRow: () => null },
    "@/components/hrm-ui": moduleAt("../src/components/hrm-ui.tsx"),
    "@/components/leave-detail": { __esModule: true, default: () => null, LeaveBadge: () => null },
    "@/lib/hrm-api": hrm, "@/lib/hrm-format": format, "@/lib/leave-requests": leave,
    "@/lib/leave-preview": moduleAt("../src/lib/leave-preview.ts", { "@/lib/hrm-format": format }),
    "@/lib/notifications": { announceNotificationChange: () => {} },
    "@/lib/use-api-resource": { useApiResource: loader => ({
      data: loader === hrm.fetchMyProfile ? { roles: ["HR"], employee: { id: 2 } }
        : loader === leave.fetchLeaveTypes ? [] : { content: [], totalElements: 0 },
      loading: false, error: "", reload: () => {},
    }) },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Component, { apiEnabled: true }));
  const button = html.match(/<button[^>]*class="([^"]*)"[^>]*>Xóa bộ lọc<\/button>/);
  assert.ok(button, "reset button is rendered");
  for (const token of ["inline-flex", "h-10", "shrink-0", "whitespace-nowrap", "items-center"])
    assert.ok(button[1].split(" ").includes(token), token);
  assert.ok(html.includes("sm:grid-cols-[minmax(0,1fr)_auto]"));
  assert.ok(html.includes("max-w-20 flex-none"));
});
