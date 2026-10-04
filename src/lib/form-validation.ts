export type FormErrors = Record<string, string>;

export function validateForm(
  form: HTMLFormElement,
  labels: Record<string, string>,
): FormErrors {
  const errors: FormErrors = {};
  for (const [name, label] of Object.entries(labels)) {
    const element = form.elements.namedItem(name);
    if (!element || !("validity" in element) || !("value" in element)) continue;
    const field = element as unknown as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement;
    if (field.disabled || ("readOnly" in field && field.readOnly)) continue;
    const value = field.value.trim();
    const validity = field.validity;
    const lowerLabel = label.toLocaleLowerCase("vi");
    if (validity.badInput) {
      errors[name] = `Vui lòng nhập ${lowerLabel} hợp lệ.`;
    } else if (field.required && !value) {
      errors[name] = `Vui lòng nhập ${lowerLabel}.`;
    } else if (value && validity.typeMismatch) {
      errors[name] = `${label} không đúng định dạng.`;
    } else if (value && (validity.rangeUnderflow || validity.rangeOverflow)) {
      const numberField = field as HTMLInputElement;
      errors[name] =
        `${label} phải từ ${numberField.min} đến ${numberField.max}.`;
    } else if (value && validity.stepMismatch) {
      errors[name] = `${label} phải là số nguyên.`;
    } else if (value && validity.patternMismatch) {
      errors[name] = `${label} không đúng định dạng.`;
    } else if (
      "maxLength" in field &&
      field.maxLength >= 0 &&
      value.length > field.maxLength
    ) {
      errors[name] = `${label} không được vượt quá ${field.maxLength} ký tự.`;
    }
  }
  return errors;
}

export function focusFirstError(form: HTMLFormElement, errors: FormErrors) {
  const field = form.elements.namedItem(Object.keys(errors)[0] ?? "");
  if (field && "focus" in field && typeof field.focus === "function")
    field.focus();
}
