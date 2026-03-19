"use client";

import { logoutAction } from "@/app/actions/logout";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
      >
        Выйти
      </button>
    </form>
  );
}
