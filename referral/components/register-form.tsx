"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";

import { registerAction, type RegisterState } from "@/app/actions/register";
import { computeDeviceFingerprintHex } from "@/lib/fingerprint-client";

import { FormStatusButton } from "@/components/form-status-button";

const initial: RegisterState = { ok: false, message: "" };

export function RegisterForm() {
  const fpRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [state, formAction] = useFormState(registerAction, initial);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hex = await computeDeviceFingerprintHex();
        if (!cancelled && fpRef.current) {
          fpRef.current.value = hex;
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form action={formAction} className="mx-auto max-w-md space-y-4">
      <input type="hidden" name="deviceFingerprint" ref={fpRef} />

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
        <label htmlFor="name" className="mb-1 block text-sm text-slate-300">
          Имя
        </label>
        <input
          id="name"
          name="name"
          type="text"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-emerald-500/40 focus:ring-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
          Пароль (8+, буква и цифра)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-emerald-500/40 focus:ring-2"
        />
      </div>

      {!state.ok && state.message ? (
        <p className="text-sm text-rose-400" role="alert">
          {state.message}
        </p>
      ) : null}

      <FormStatusButton
        idleLabel="Создать аккаунт"
        pendingLabel="Регистрация…"
        disabled={!ready}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
