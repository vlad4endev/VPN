import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-50">
        Реферальная программа Win–Win
      </h1>
      <p className="text-slate-400">
        Переходите по ссылке с параметром{" "}
        <code className="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
          ?ref=КОД
        </code>
        — код сохранится в куки на 30 дней и в{" "}
        <code className="rounded bg-slate-900 px-1.5">localStorage</code>.
        После регистрации начисляются отложенные бонусы рефереру и приглашённому.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/register"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Регистрация
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-600 px-5 py-2.5 text-sm text-slate-200 hover:bg-slate-900"
        >
          Войти
        </Link>
      </div>
    </div>
  );
}
