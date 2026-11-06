"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Bir hata oluştu</h1>
      <p className="mt-1 text-sm text-ink-muted">İşlem tamamlanamadı. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.</p>
      <Button className="mt-6" onClick={reset}>
        Tekrar dene
      </Button>
    </div>
  );
}
