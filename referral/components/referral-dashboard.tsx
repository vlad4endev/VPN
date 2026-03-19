"use client";

import { useCallback, useState } from "react";

export type InvitedRow = {
  id: string;
  status: "PENDING" | "COMPLETED" | "FRAUD";
  createdAt: string;
  referee: {
    email: string;
    name: string | null;
  };
};

type Props = {
  referralCode: string;
  shareUrl: string;
  invited: InvitedRow[];
};

export function ReferralDashboard({
  referralCode,
  shareUrl,
  invited,
}: Props) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = useCallback(async (text: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  const statusLabel: Record<InvitedRow["status"], string> = {
    PENDING: "Ожидает",
    COMPLETED: "Завершено",
    FRAUD: "Отклонено",
  };

  const statusClass: Record<InvitedRow["status"], string> = {
    PENDING: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    COMPLETED: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    FRAUD: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/20">
        <h2 className="text-lg font-semibold text-slate-100">
          Ваш реферальный код
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Поделитесь ссылкой — бонусы начисляются после регистрации друга
          (Win–Win: награды в статусе «отложено» до подтверждения платёжным
          модулем).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-slate-950 px-4 py-2 text-xl font-bold tracking-widest text-emerald-400">
            {referralCode}
          </code>
          <button
            type="button"
            onClick={() => copy(referralCode, "code")}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            {copied === "code" ? "Скопировано" : "Копировать код"}
          </button>
          <button
            type="button"
            onClick={() => copy(shareUrl, "link")}
            className="rounded-lg border border-emerald-600/50 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/50"
          >
            {copied === "link" ? "Ссылка скопирована" : "Копировать ссылку"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold text-slate-100">
          Приглашённые друзья
        </h2>
        {invited.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Пока никого не пригласили — отправьте свою ссылку.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-800">
            {invited.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-200">
                    {row.referee.name || row.referee.email}
                  </p>
                  <p className="text-xs text-slate-500">{row.referee.email}</p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusClass[row.status]}`}
                >
                  {statusLabel[row.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
