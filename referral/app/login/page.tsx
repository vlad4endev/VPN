import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-50">Вход</h1>
      <LoginForm />
    </div>
  );
}
