import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listFaq } from "@/lib/queries/faq";
import { SUBSPECIALTY_LABELS, subspecialtyEnum, type Subspecialty } from "@/db/schema";
import { PageHeader, Card, CardContent, EmptyState, Badge, Input, Button, buttonClasses } from "@/components/ui";
import { MarkdownLite } from "@/components/assistant/markdown-lite";
import { FaqRowActions } from "@/components/faq/faq-row-actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Sık Sorulan Sorular" };

const SUBS = subspecialtyEnum.enumValues;

export default async function FaqPage({ searchParams }: PageProps<"/sss">) {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const subRaw = typeof sp.brans === "string" ? sp.brans : "";
  const subspecialty = (SUBS as readonly string[]).includes(subRaw) ? (subRaw as Subspecialty) : undefined;
  const showDrafts = staff && sp.taslak === "1";
  const rows = await listFaq({ q: q || undefined, subspecialty, includeUnpublished: showDrafts });

  const link = (next: { q?: string; brans?: string; taslak?: string }) => {
    const p = new URLSearchParams();
    const qq = next.q ?? q;
    const b = next.brans ?? subRaw;
    const t = next.taslak ?? (showDrafts ? "1" : "");
    if (qq) p.set("q", qq);
    if (b) p.set("brans", b);
    if (t) p.set("taslak", t);
    const s = p.toString();
    return s ? `/sss?${s}` : "/sss";
  };

  return (
    <>
      <PageHeader
        title="Sık Sorulan Sorular"
        description="Öğretim üyelerinin yazdığı, kaynağa dayalı kısa yanıtlar. Yapay zekâ kullanılmaz; asistan sohbeti de bu yanıtları önce gösterir."
        actions={
          staff ? (
            <Link href="/sss/yeni" className={buttonClasses("primary", "md")}>
              Yeni soru
            </Link>
          ) : undefined
        }
      />

      <form action="/sss" method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Soru veya anahtar kelime ara…" aria-label="Ara" className="max-w-md flex-1" />
        {subRaw && <input type="hidden" name="brans" value={subRaw} />}
        {showDrafts && <input type="hidden" name="taslak" value="1" />}
        <Button type="submit" variant="outline">
          Ara
        </Button>
        {q && (
          <Link href={link({ q: "" })} className="text-sm text-ink-muted underline">
            Temizle
          </Link>
        )}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">Alt branş:</span>
        <Link href={link({ brans: "" })} className={chip(!subspecialty)}>
          Tümü
        </Link>
        {SUBS.map((s) => (
          <Link key={s} href={link({ brans: s })} className={chip(subspecialty === s)}>
            {SUBSPECIALTY_LABELS[s]}
          </Link>
        ))}
        {staff && (
          <Link href={link({ taslak: showDrafts ? "" : "1" })} className={`ml-auto ${chip(showDrafts)}`}>
            {showDrafts ? "Taslaklar dâhil" : "Taslakları göster"}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "Eşleşen soru bulunamadı" : "Henüz soru yok"}
          description={staff ? "Yeni soru ekleyerek asistanların en sık sorduğu konuları yanıtlayın." : "Öğretim üyeleri soru ekledikçe burada listelenir."}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => (
            <li key={f.id}>
              <Card>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-ink">{f.question}</h2>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {f.subspecialty && <Badge>{SUBSPECIALTY_LABELS[f.subspecialty]}</Badge>}
                      {!f.published && <Badge tone="warning">Taslak</Badge>}
                    </div>
                  </div>
                  <MarkdownLite text={f.answer} />
                  <p className="text-xs text-ink-muted">
                    {f.authorName ?? "Öğretim üyesi"} · {formatDate(f.updatedAt)}
                    {f.sourceTitle ? (
                      <>
                        {" · Kaynak: "}
                        {staff && f.sourceId ? (
                          <Link href={`/kaynaklar/${f.sourceId}`} className="underline">
                            {f.sourceTitle}
                          </Link>
                        ) : (
                          f.sourceTitle
                        )}
                        {f.sourceNote ? `, ${f.sourceNote}` : ""}
                      </>
                    ) : null}
                  </p>
                  {staff && <FaqRowActions id={f.id} question={f.question} published={f.published} />}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function chip(active: boolean) {
  return active
    ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
    : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted";
}
