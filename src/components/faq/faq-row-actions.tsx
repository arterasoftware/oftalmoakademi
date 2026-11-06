"use client";

import Link from "next/link";
import { deleteFaqAction, setFaqPublishedAction } from "@/lib/actions/faq";
import { SubmitButton, buttonClasses } from "@/components/ui";

export function FaqRowActions({ id, question, published }: { id: string; question: string; published: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/sss/${id}/duzenle`} className={buttonClasses("outline", "sm")}>
        Düzenle
      </Link>
      <form action={setFaqPublishedAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="published" value={published ? "0" : "1"} />
        <SubmitButton variant={published ? "ghost" : "secondary"} size="sm">
          {published ? "Yayından kaldır" : "Yayımla"}
        </SubmitButton>
      </form>
      <form action={deleteFaqAction}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="danger" size="sm" onClick={(e) => !window.confirm(`"${question}" kalıcı olarak silinecek. Devam edilsin mi?`) && e.preventDefault()}>
          Sil
        </SubmitButton>
      </form>
    </div>
  );
}
