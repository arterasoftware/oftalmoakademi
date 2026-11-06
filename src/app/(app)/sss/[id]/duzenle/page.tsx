import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { getFaq } from "@/lib/queries/faq";
import { listSources } from "@/lib/queries/sources";
import { PageHeader, Card, CardContent } from "@/components/ui";
import { FaqForm } from "@/components/faq/faq-form";

export const metadata = { title: "Soruyu düzenle · SSS" };

export default async function EditFaqPage({ params }: PageProps<"/sss/[id]/duzenle">) {
  await requireStaff();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const [faq, sources] = await Promise.all([getFaq(id, { includeUnpublished: true }), listSources()]);
  if (!faq) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/sss" className="hover:underline">
            ← Sık Sorulan Sorular
          </Link>
        }
        title="Soruyu düzenle"
      />
      <Card className="max-w-3xl">
        <CardContent>
          <FaqForm
            initial={{ id: faq.id, question: faq.question, answer: faq.answer, sourceId: faq.sourceId, sourceNote: faq.sourceNote, subspecialty: faq.subspecialty, published: faq.published }}
            sources={sources.map((s) => ({ id: s.id, title: s.title, approved: s.approved }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
