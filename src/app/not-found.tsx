import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-brand-600">404</p>
      <h1 className="mt-2 text-xl font-semibold text-ink">Sayfa bulunamadı</h1>
      <Link href="/panel" className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white">
        Ana sayfaya dön
      </Link>
    </div>
  );
}
