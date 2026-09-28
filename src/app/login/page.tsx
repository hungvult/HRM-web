"use client";

import {
  BriefcaseBusiness,
  Clock3,
  Eye,
  EyeOff,
  LoaderCircle,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { loginWithApi, type LoginPayload } from "@/lib/auth";

function resolveLoginMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("khóa") || message.includes("locked")) {
      return "Tài khoản đang bị khóa. Vui lòng liên hệ quản trị viên.";
    }

    if (message.includes("vô hiệu") || message.includes("disabled")) {
      return "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.";
    }
  }

  return "Tên đăng nhập/email hoặc mật khẩu không đúng.";
}

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload: LoginPayload = {
      identity: String(formData.get("identity") ?? ""),
      password: String(formData.get("password") ?? ""),
      remember: formData.get("remember") === "on",
    };

    try {
      await loginWithApi(payload);
      setMessage("Đăng nhập thành công. Đang chuyển tới hệ thống...");
      router.push("/accounts");
    } catch (error) {
      setMessage(resolveLoginMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-cover bg-center px-5 py-10 sm:px-8"
      style={{ backgroundImage: "url('/hrm-login-background.jpg')" }}
    >
      <div className="absolute inset-0 bg-foreground/30" aria-hidden="true" />
      <div className="login-pattern absolute inset-0 opacity-40" aria-hidden="true" />

      <section
        className="login-rise relative z-10 w-full max-w-[25rem] rounded-[4px] bg-white px-8 py-10 shadow-[0_24px_80px_rgba(36,31,26,0.22)] sm:px-10"
        aria-labelledby="login-title"
      >
        <header className="mb-9 text-center">
          <p className="mb-1 font-display text-lg uppercase text-muted-foreground">
            HRM System
          </p>
          <h1
            id="login-title"
            className="font-display text-[2.75rem] font-bold leading-tight text-foreground"
          >
            Đăng nhập
          </h1>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              htmlFor="identity"
              className="block text-[0.9rem] font-medium"
            >
              Tên đăng nhập / Email
            </label>
            <input
              id="identity"
              name="identity"
              type="text"
              autoComplete="username"
              required
              placeholder="VD: user@company.com / admin_01"
              className="h-11 w-full rounded-sm border border-input bg-card px-3 text-[0.95rem] text-foreground shadow-none outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-[0.9rem] font-medium"
            >
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Nhập mật khẩu"
                className="h-11 w-full rounded-sm border border-input bg-card px-3 pr-11 text-[0.95rem] text-foreground shadow-none outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                className="absolute right-1.5 top-1.5 flex size-8 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-0.5">
            <div className="flex items-center gap-2">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                className="size-4 rounded-[2px] border-input accent-ring"
              />
              <label
                htmlFor="remember"
                className="cursor-pointer text-[0.82rem] font-normal text-muted-foreground"
              >
                Ghi nhớ đăng nhập
              </label>
            </div>
            <button
              type="button"
              className="h-auto shrink-0 cursor-pointer p-0 text-[0.82rem] text-ring underline-offset-2 transition hover:underline focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={() =>
                setMessage("Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.")
              }
            >
              Quên mật khẩu?
            </button>
          </div>

          <button
            type="submit"
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-primary bg-primary px-6 text-[0.95rem] font-semibold uppercase text-primary-foreground shadow-login transition hover:bg-primary/92 focus:outline-none focus:ring-1 focus:ring-ring active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isSubmitting ? "Đang xác nhận" : "Xác nhận đăng nhập"}
          </button>

          <p
            className="min-h-5 text-center text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </form>
      </section>

      <aside
        className="login-rise absolute right-8 top-8 hidden items-center gap-3 xl:flex"
        aria-label="Ứng dụng liên kết"
      >
        <p className="text-[0.65rem] font-semibold uppercase text-white/75">
          Ứng dụng liên kết
        </p>
        <div className="flex items-center gap-1.5 rounded-md border border-white/25 bg-foreground/15 p-1.5 backdrop-blur-[2px]">
          {[
            { label: "Chấm công", Icon: Clock3 },
            { label: "Tuyển dụng", Icon: BriefcaseBusiness },
            { label: "Bảng lương", Icon: WalletCards },
          ].map(({ label, Icon }) => (
            <span
              key={label}
              className="grid size-8 place-items-center rounded-sm text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              title={label}
              aria-label={label}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ))}
        </div>
      </aside>
    </main>
  );
}
