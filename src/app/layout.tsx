import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HRM System",
  description: "Hệ thống quản trị nhân sự cho doanh nghiệp.",
  openGraph: {
    title: "HRM System",
    description: "Hệ thống quản trị nhân sự cho doanh nghiệp.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
