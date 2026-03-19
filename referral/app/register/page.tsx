import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-50">Регистрация</h1>
      <p className="text-sm text-slate-500">
        Если вы перешли по реферальной ссылке, код уже в куки — не вводите
        ничего вручную.
      </p>
      <RegisterForm />
    </div>
  );
}
