import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listPublishedLessons, listStaffLessons } from "@/lib/queries/lessons";
import { PageHeader, EmptyState, Input, Select, Button, buttonClasses } from "@/components/ui";
import { SUBSPECIALTY_LABELS, subspecialtyEnum, type Subspecialty } from "@/db/schema";
import { LessonCard } from "./lesson-card";

export const metadata = { title: "Dersler" };

type SP = Record<string, string | string[] | undefined>;

function pickSubspecialty(v: string | string[] | undefined): Subspecialty | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && (subspecialtyEnum.enumValues as readonly string[]).includes(s) ? (s as Subspecialty) : undefined;
}

export default async function DerslerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const subspecialty = pickSubspecialty(sp.brans);
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim().slice(0, 100) || undefined;
  const staff = isStaff(user.role);

  const [published, staffList] = await Promise.all([listPublishedLessons({ subspecialty, q }), staff ? listStaffLessons({ subspecialty, q }) : Promise.resolve([])]);

  return (
    <>
      <PageHeader
        title="Dersler"
        description="Öğretim üyelerinin materyal ve ders notuyla hazırladığı dersler."
        actions={
          staff ? (
            <Link href="/dersler/yeni" className={buttonClasses("primary", "md")}>
              Yeni ders
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]" role="search">
        <Input type="search" name="q" placeholder="Başlıkta ara…" defaultValue={q ?? ""} aria-label="Ders ara" />
        <Select name="brans" defaultValue={subspecialty ?? ""} aria-label="Alt branş">
          <option value="">Tüm alt branşlar</option>
          {subspecialtyEnum.enumValues.map((s) => (
            <option key={s} value={s}>
              {SUBSPECIALTY_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Filtrele
        </Button>
      </form>

      {staff && staffList.length > 0 && (
        <section className="mb-8" aria-labelledby="taslaklar">
          <h2 id="taslaklar" className="mb-3 text-lg font-semibold text-ink">
            Taslaklarım ve arşiv <span className="text-sm font-normal text-ink-muted">({staffList.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {staffList.map((l) => (
              <LessonCard key={l.id} lesson={l} showStatus />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="yayimlanan">
        <h2 id="yayimlanan" className="mb-3 text-lg font-semibold text-ink">
          Yayımlanan dersler <span className="text-sm font-normal text-ink-muted">({published.length})</span>
        </h2>
        {published.length === 0 ? (
          <EmptyState
            title="Henüz yayımlanmış ders yok"
            description={q || subspecialty ? "Filtreyle eşleşen ders bulunamadı." : "İlk ders yayımlandığında burada ve bildirimlerinizde görünecek."}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {published.map((l) => (
              <LessonCard key={l.id} lesson={l} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
