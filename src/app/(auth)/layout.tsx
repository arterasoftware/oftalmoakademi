export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-lg font-bold text-white">OA</span>
        <div>
          <p className="text-lg font-semibold leading-tight text-ink">OftalmoAkademi</p>
          <p className="text-xs text-ink-muted">Oftalmoloji Asistan Eğitim Platformu</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">{children}</div>
      <p className="mt-6 max-w-md text-center text-xs text-ink-faint">
        Bu platform yalnızca davetli kullanıcılara açıktır. Tüm erişimler kayıt altına alınır. İçerikler eğitim amaçlıdır; klinik karar
        desteği yerine geçmez.
      </p>
    </div>
  );
}
