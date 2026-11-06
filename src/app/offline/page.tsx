export const metadata = { title: "Çevrimdışı" };

export default function Offline() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Çevrimdışısınız</h1>
      <p className="mt-1 text-sm text-ink-muted">Eğitim içerikleri gizlilik nedeniyle cihazda saklanmaz. Bağlantı sağlandığında yeniden deneyin.</p>
    </div>
  );
}
