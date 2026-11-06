import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";
import { Alert } from "@/components/ui";

export const metadata = { title: "Giriş" };

export default async function LoginPage({ searchParams }: PageProps<"/giris">) {
  const s = await getCurrentSession();
  if (s) redirect(s.user.mfaEnabled && !s.session.mfaVerified ? "/giris/mfa" : "/panel");
  const sp = await searchParams;
  const hata = typeof sp.hata === "string" ? sp.hata : undefined;
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">Giriş yapın</h1>
      <p className="mt-1 text-sm text-ink-muted">Kurumsal e-posta adresiniz ve parolanızla devam edin.</p>
      {hata === "mfa" && (
        <Alert tone="danger" className="mt-4">
          Çok fazla hatalı doğrulama kodu girildi. Oturum kapatıldı; yeniden giriş yapın.
        </Alert>
      )}
      <LoginForm />
    </>
  );
}
