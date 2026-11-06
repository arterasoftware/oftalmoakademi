import Link from "next/link";
import { requireStaff } from "@/lib/auth/dal";
import { listSources } from "@/lib/queries/sources";
import { PageHeader, Card, CardContent } from "@/components/ui";
import { FaqForm } from "@/components/faq/faq-form";

export const metadata = { title: "Yeni soru · SSS" };

export default async function NewFaqPage() {
  await requireStaff();
  const sources = await listSources();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sss" className="hover:underline">
            ← Sık Sorulan Sorular
          </Link>
        }
        title="Yeni soru"
        description="Asistanların sık sorduğu bir soruyu kaynağa dayanarak yanıtlayın. Yayımlanan yanıt asistan sohbetinde de gösterilir."
      />
      <Card className="max-w-3xl">
        <CardContent>
          <FaqForm sources={sources.map((s) => ({ id: s.id, title: s.title, approved: s.approved }))} />
        </CardContent>
      </Card>
    </>
  );
}
