export function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value.slice(0, 10) + "T00:00:00");
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("vi-VN").format(date);
}
export function matchesSearch(query: string, values: string[]) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLocaleLowerCase("vi")
      .trim();
  return normalize(values.join(" ")).includes(normalize(query));
}
export function downloadCsv(filename: string, rows: string[][]) {
  const text = rows
    .map((row) =>
      row
        .map((value) => {
          const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
          return '"' + safe.replace(/"/g, '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
