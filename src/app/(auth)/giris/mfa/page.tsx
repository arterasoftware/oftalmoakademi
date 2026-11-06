import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/dal";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "İki adımlı doğrulama" };

export default async function MfaPage() {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  if (!s.user.mfaEnabled || s.session.mfaVerified) redirect("/panel");
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">İki adımlı doğrulama</h1>
      <p className="mt-1 text-sm text-ink-muted">Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin. Erişiminiz yoksa kurtarma kodlarınızdan birini kullanın.</p>
      <MfaForm />
    </>
  );
}
