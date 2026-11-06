import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listCasesForViewer, type CaseListItem } from "@/lib/queries/cases";
import { CASE_STATUSES, type CaseStatus } from "@/lib/status-labels-cases";
import { subspecialtyEnum, type Subspecialty } from "@/db/schema";
import { PageHeader, EmptyState, Alert, buttonClasses } from "@/components/ui";
import { CaseCard } from "@/components/cases/case-card";
import { CaseFilters } from "@/components/cases/case-filters";
import { slugify } from "@/lib/utils";

export const metadata = { title: "Klinik Olgular" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CasesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const sp = await searchParams;

  const altdal = first(sp.altdal);
  const durum = first(sp.durum);
  const subspecialty = altdal && (subspecialtyEnum.enumValues as readonly string[]).includes(altdal) ? (altdal as Subspecialty) : undefined;
  const status = staff && durum && (CASE_STATUSES as string[]).includes(durum) ? (durum as CaseStatus) : undefined;

  const data = await listCasesForViewer(user, { subspecialty, status });
  const filtered = Boolean(subspecialty || status);
  const myHidden = data.hidden.filter((c) => c.authorId === user.id);

  return (
    <>
      <PageHeader
        title="Klinik Olgular"
        description="Kimliksizleştirilmiş olgularınızı metin, görsel ve ses kaydıyla paylaşın; asistanlar ve öğretim üyeleri altında tartışsın."
        actions={
          <Link href="/olgular/yeni" className={buttonClasses("primary", "md")}>
            <Plus className="h-4 w-4" /> Olgu paylaş
          </Link>
        }
      />
      <Alert tone="info" className="mb-5">
        Eğitim amaçlıdır; gerçek zamanlı hasta yönetimi için klinik karar aracı değildir.
      </Alert>

      <div className="mb-6">
        <Suspense fallback={null}>
          <CaseFilters statuses={staff ? CASE_STATUSES : []} />
        </Suspense>
      </div>

      <div className="space-y-8">
        <Section
          title="Tartışmaya açık olgular"
          items={data.open}
          empty={filtered ? "Filtreye uyan olgu yok." : "Henüz olgu paylaşılmadı. İlk olguyu siz paylaşın."}
          showAuthor
          emptyAction={
            <Link href="/olgular/yeni" className={buttonClasses("secondary", "sm")}>
              Olgu paylaş
            </Link>
          }
        />
        {staff && (data.hidden.length > 0 || status === "HIDDEN") && <Section title="Gizlenen olgular" items={data.hidden} empty="Gizlenmiş olgu yok." showAuthor />}
        {!staff && myHidden.length > 0 && <Section title="Gizlenen olgularım" items={myHidden} empty="" />}
      </div>
    </>
  );
}

function Section({ title, items, empty, showAuthor, emptyAction }: { title: string; items: CaseListItem[]; empty: string; showAuthor?: boolean; emptyAction?: React.ReactNode }) {
  const headingId = `sec-${slugify(title)}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-lg font-semibold text-ink">
        {title} <span className="text-sm font-normal text-ink-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <EmptyState title={empty} action={emptyAction} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((c) => (
            <CaseCard key={c.id} item={c} showAuthor={showAuthor} />
          ))}
        </div>
      )}
    </section>
  );
}
