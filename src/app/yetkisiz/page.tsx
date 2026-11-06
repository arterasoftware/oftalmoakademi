import Link from "next/link";

export const metadata = { title: "Yetkisiz" };

export default function Forbidden() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-brand-600">403</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">Bu sayfaya erişim yetkiniz yok</h1>
      <p className="mt-1 text-sm text-ink-muted">Rolünüz bu işlem için yeterli değil. Yöneticinizle iletişime geçebilirsiniz.</p>
      <Link href="/panel" className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white">
        Ana sayfaya dön
      </Link>
    </div>
  );
}
