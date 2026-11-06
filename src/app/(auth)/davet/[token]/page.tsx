import { findValidInvitation } from "@/lib/auth/invitations";
import { ROLE_LABELS } from "@/lib/auth/dal";
import { Alert } from "@/components/ui";
import { AcceptForm } from "./accept-form";
import Link from "next/link";

export const metadata = { title: "Davet" };

export default async function InvitePage({ params }: PageProps<"/davet/[token]">) {
  const { token } = await params;
  const inv = await findValidInvitation(token);
  if (!inv) {
    return (
      <>
        <h1 className="text-xl font-semibold text-ink">Davet geçersiz</h1>
        <Alert tone="warning" className="mt-4">
          Bu davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Yöneticinizden yeni bir davet isteyin.
        </Alert>
        <Link href="/giris" className="mt-4 inline-block text-sm text-brand-700 underline">
          Giriş sayfasına dön
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-xl font-semibold text-ink">Hesabınızı oluşturun</h1>
      <p className="mt-1 text-sm text-ink-muted">
        <span className="font-medium text-ink">{inv.email}</span> adresine <span className="font-medium text-ink">{ROLE_LABELS[inv.role]}</span> rolüyle davet edildiniz.
      </p>
      <AcceptForm token={token} role={inv.role} defaultName={inv.name ?? ""} />
    </>
  );
}
