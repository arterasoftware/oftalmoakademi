import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeOff, Mic, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { getCaseForViewer } from "@/lib/queries/cases";
import { aiAvailable } from "@/lib/ai/client";
import { CASE_STATUS } from "@/lib/status-labels-cases";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Alert, Badge, AiBadge, Card, CardHeader, CardTitle, CardContent, buttonClasses } from "@/components/ui";
import { CaseGallery } from "@/components/cases/case-gallery";
import { fmtDur } from "@/components/audio/audio-recorder";
import { CaseActions, CaseHintRequest } from "@/components/cases/case-workflow";
import { Discussion } from "@/components/discussion/discussion";

export const metadata = { title: "Olgu" };

type Props = { params: Promise<{ id: string }> };

export default async function CaseDetailPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const c = await getCaseForViewer(id, user);
  if (!c) notFound();
  const st = CASE_STATUS[c.status];
  const ai = aiAvailable();
  const path = `/olgular/${c.id}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/olgular" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="h-3 w-3" /> Olgular
          </Link>
        }
        title={c.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{SUBSPECIALTY_LABELS[c.subspecialty]}</Badge>
            {c.status === "HIDDEN" && (
              <Badge tone={st.tone}>
                <EyeOff className="h-3 w-3" /> {st.label}
              </Badge>
            )}
            {c.author && (
              <span className="text-xs text-ink-muted">
                {c.author.title ? `${c.author.title} ` : ""}
                {c.author.name} · {formatDateTime(c.publishedAt)}
              </span>
            )}
          </span>
        }
        actions={
          c.canEdit ? (
            <Link href={`${path}/duzenle`} className={buttonClasses("outline", "sm")}>
              <Pencil className="h-4 w-4" /> Düzenle
            </Link>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <Alert tone="info">Eğitim amaçlıdır; gerçek zamanlı hasta yönetimi için klinik karar aracı değildir.</Alert>
        {c.status === "HIDDEN" && <Alert tone="warning">{st.description}</Alert>}

        <Card>
          <CardContent className="py-5">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{c.body}</p>
          </CardContent>
        </Card>

        {c.images.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Görseller</CardTitle>
            </CardHeader>
            <CardContent>
              <CaseGallery images={c.images} />
            </CardContent>
          </Card>
        )}

        {c.audio && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-4 w-4" /> Ses kaydı{c.audio.durationSec !== null ? <span className="text-sm font-normal text-ink-muted">{fmtDur(c.audio.durationSec)}</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <audio controls preload="metadata" src={`/api/dosya/${c.audio.fileId}`} className="w-full" />
            </CardContent>
          </Card>
        )}

        <CaseActions caseId={c.id} status={c.status} isStaff={c.isStaff} isAuthor={c.isAuthor} aiAvailable={ai} />

        {c.aiSummary && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Tartışma özeti</CardTitle>
                <AiBadge label="Yapay zekâ tartışma özeti" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-ink">{c.aiSummary}</p>
              <p className="mt-1 text-xs text-ink-muted">Bu özet yapay zekâ tarafından üretildi; uzman görüşünün yerine geçmez.</p>
            </CardContent>
          </Card>
        )}

        {c.status === "PUBLISHED" && !c.isStaff && <CaseHintRequest caseId={c.id} aiAvailable={ai} locked={c.discussionLocked} />}

        <Discussion targetType="CASE" targetId={c.id} path={path} />
      </div>
    </>
  );
}
