"use client";

import Link from "next/link";
import { useActionState } from "react";
import { lessonWorkflowAction } from "@/lib/actions/lessons";
import { SubmitButton, Alert, buttonClasses } from "@/components/ui";
import type { Lesson } from "@/db/schema";

/** Yazar/yönetici için: düzenle, yayımla, yayından kaldır, arşivle, sil. Yetki ve durum sunucuda yeniden doğrulanır. */
export function LessonWorkflow({ lessonId, status }: { lessonId: string; status: Lesson["status"] }) {
  const [state, action] = useActionState(lessonWorkflowAction, null);
  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-4">
      {state && !state.ok && (
        <Alert tone="danger" className="mb-3">
          {state.error}
        </Alert>
      )}
      {state && state.ok && state.message && (
        <Alert tone="success" className="mb-3">
          {state.message}
        </Alert>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={lessonId} />
        <Link href={`/dersler/${lessonId}/duzenle`} className={buttonClasses("outline", "sm")}>
          Düzenle
        </Link>
        {status !== "PUBLISHED" && (
          <SubmitButton size="sm" name="op" value="publish">
            Yayımla
          </SubmitButton>
        )}
        {status === "PUBLISHED" && (
          <>
            <SubmitButton size="sm" variant="outline" name="op" value="unpublish" onClick={(e) => !confirm("Ders yayından kaldırılacak ve taslağa dönecek. Devam?") && e.preventDefault()}>
              Yayından kaldır
            </SubmitButton>
            <SubmitButton size="sm" variant="outline" name="op" value="archive" onClick={(e) => !confirm("Ders arşivlenecek ve asistanlara gösterilmeyecek. Devam?") && e.preventDefault()}>
              Arşivle
            </SubmitButton>
          </>
        )}
        {status !== "PUBLISHED" && (
          <SubmitButton size="sm" variant="danger" name="op" value="delete" onClick={(e) => !confirm("Ders ve materyalleri kalıcı olarak silinecek. Emin misiniz?") && e.preventDefault()}>
            Sil
          </SubmitButton>
        )}
      </form>
    </div>
  );
}
