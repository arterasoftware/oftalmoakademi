import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listPublishedArticles, countCandidates } from "@/lib/queries/articles";
import { PageHeader, EmptyState, Badge, buttonClasses } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Makaleler" };

export default async function MakalelerPage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const [articles, counts] = await Promise.all([listPublishedArticles(), staff ? countCandidates() : Promise.resolve(null)]);

  return (
    <>
      <PageHeader
        title="Haftanın makalesi"
        description="Journal Club: öğretim üyesi seçimiyle yayımlanan makaleler, Türkçe özet ve tartışma soruları."
        actions={
          staff && counts ? (
            <>
              <Link href="/makaleler/oneriler" className={buttonClasses("outline", "md")}>
                Öneriler ve seçim
                <Badge tone={counts.suggested ? "warning" : "neutral"}>{counts.suggested} öneri</Badge>
                <Badge tone={counts.selected ? "info" : "neutral"}>{counts.selected} seçili</Badge>
              </Link>
              <Link href="/makaleler/oneriler#ekle" className={buttonClasses("primary", "md")}>
                + Makale ekle
              </Link>
            </>
          ) : undefined
        }
      />

      {articles.length === 0 ? (
        <EmptyState title="Henüz yayımlanmış makale yok" description="İlk makale yayımlandığında burada görünecek." />
      ) : (
        <ul className="space-y-3">
          {articles.map((a) => (
            <li key={a.id}>
              <Link href={`/makaleler/${a.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-brand-300">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  {a.weekOf && <Badge tone="brand">{formatDate(a.weekOf)} haftası</Badge>}
                  {a.subspecialty && <Badge>{SUBSPECIALTY_LABELS[a.subspecialty]}</Badge>}
                  {a.hasSummary && <Badge tone="ai">Türkçe özet</Badge>}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{a.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {[a.authors, a.journal, a.publishedOn].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
