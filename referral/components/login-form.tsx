"use client";

import { useFormState } from "react-dom";

import { loginAction, type LoginState } from "@/app/actions/login";

import { FormStatusButton } from "@/components/form-status-button";

const initial: LoginState = { ok: false, message: "" };

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initial);

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-emerald-500/40 focus:ring-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-emerald-500/40 focus:ring-2"
        />
      </div>

      {!state.ok && state.message ? (
        <p className="text-sm text-rose-400" role="alert">
          {state.message}
        </p>
      ) : null}

      <FormStatusButton
        idleLabel="Войти"
        pendingLabel="Вход…"
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
      />
    </form>
  );
}
