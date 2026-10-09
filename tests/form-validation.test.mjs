import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/form-validation.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(source, sandbox);
const { validateForm, focusFirstError } = sandbox.exports;
const form = (fields) => ({
  elements: { namedItem: (name) => fields[name] ?? null },
});
const field = (overrides = {}) => ({
  value: "",
  required: true,
  disabled: false,
  readOnly: false,
  validity: {},
  ...overrides,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const [name, label] of Object.entries({
  fullName: "Họ tên",
  email: "Email",
  phone: "Số điện thoại",
  hireDate: "Ngày vào làm",
  code: "Mã phòng ban",
  name: "Tên phòng ban",
  rankLevel: "Cấp bậc chức vụ",
  address: "Địa chỉ hiện tại",
})) {
  for (const value of ["", "   "]) {
    test(label + " requires nonblank text and reports Vietnamese", () => {
      assert.equal(
        validateForm(form({ [name]: field({ value }) }), { [name]: label })[
          name
        ],
        "Vui lòng nhập " + label.toLocaleLowerCase("vi") + ".",
      );
    });
  }
}
test("invalid email does not use the browser's English validationMessage", () => {
  const email = field({
    value: "not-email",
    validity: { typeMismatch: true },
    validationMessage: "Please enter an email address.",
  });
  assert.equal(
    validateForm(form({ email }), { email: "Email" }).email,
    "Email không đúng định dạng.",
  );
});
for (const [value, validity] of [
  ["-1", { rangeUnderflow: true }],
  ["0", { rangeUnderflow: true }],
  ["11", { rangeOverflow: true }],
]) {
  test("rankLevel " + value + " reports the 1-10 bounds in Vietnamese", () => {
    assert.equal(
      validateForm(
        form({ rankLevel: field({ value, min: "1", max: "10", validity }) }),
        { rankLevel: "Cấp bậc chức vụ" },
      ).rankLevel,
      "Cấp bậc chức vụ phải từ 1 đến 10.",
    );
  });
}
test("fractional rank is rejected with a Vietnamese integer message", () => {
  assert.equal(
    validateForm(
      form({
        rankLevel: field({ value: "1.5", validity: { stepMismatch: true } }),
      }),
      { rankLevel: "Cấp bậc chức vụ" },
    ).rankLevel,
    "Cấp bậc chức vụ phải là số nguyên.",
  );
});
test("bad numeric input does not pass as optional empty input", () => {
  assert.equal(
    validateForm(form({ rankLevel: field({ validity: { badInput: true } }) }), {
      rankLevel: "Cấp bậc chức vụ",
    }).rankLevel,
    "Vui lòng nhập cấp bậc chức vụ hợp lệ.",
  );
});
test("valid rank bounds and valid text do not block submission", () => {
  for (const value of ["1", "10"]) {
    assert.deepEqual(
      plain(
        validateForm(form({ rankLevel: field({ value }) }), {
          rankLevel: "Cấp bậc chức vụ",
        }),
      ),
      {},
    );
  }
});
test("auto-generated codes, disabled fields and absent controls are skipped", () => {
  assert.deepEqual(
    plain(
      validateForm(
        form({
          employeeCode: field({ readOnly: true }),
          code: field({ readOnly: true }),
          name: field({ disabled: true }),
        }),
        {
          employeeCode: "Mã nhân viên",
          code: "Mã chức vụ",
          name: "Tên",
          absent: "Không có",
        },
      ),
    ),
    {},
  );
});
test("optional blank controls and unnamed controls do not get required errors", () => {
  assert.deepEqual(
    plain(
      validateForm(form({ description: field({ required: false }) }), {
        description: "Mô tả",
      }),
    ),
    {},
  );
});
test("text length is checked even when a value is assigned programmatically", () => {
  assert.equal(
    validateForm(form({ code: field({ value: "ABCD", maxLength: 3 }) }), {
      code: "Mã phòng ban",
    }).code,
    "Mã phòng ban không được vượt quá 3 ký tự.",
  );
});
test("editing invalid text into valid text clears the previous errors", () => {
  const email = field();
  const subject = form({ email });
  assert.equal(
    Object.keys(validateForm(subject, { email: "Email" })).length,
    1,
  );
  email.value = "employee@example.com";
  assert.deepEqual(plain(validateForm(subject, { email: "Email" })), {});
});
test("the first invalid field receives focus without invoking native reportValidity", () => {
  let focused = "";
  focusFirstError(
    form({
      fullName: {
        focus: () => {
          focused = "fullName";
        },
      },
    }),
    { fullName: "Thiếu họ tên" },
  );
  assert.equal(focused, "fullName");
  focusFirstError(form({}), {});
});
