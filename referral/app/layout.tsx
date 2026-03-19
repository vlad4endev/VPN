import type { Metadata } from "next";
import Link from "next/link";

import { ReferralStorageSync } from "@/components/referral-storage-sync";

import "./globals.css";

export const metadata: Metadata = {
  title: "Реферальная программа",
  description: "Win–Win реферальная система",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="font-sans">
        <ReferralStorageSync />
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold text-emerald-400">
              Skyflow Referral
            </Link>
            <nav className="flex gap-4 text-sm text-slate-400">
              <Link href="/register" className="hover:text-slate-200">
                Регистрация
              </Link>
              <Link href="/login" className="hover:text-slate-200">
                Вход
              </Link>
              <Link href="/dashboard" className="hover:text-slate-200">
                Кабинет
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
