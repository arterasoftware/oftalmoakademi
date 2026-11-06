"use client";

import { Sparkles } from "lucide-react";
import { ActionForm } from "./action-form";
import { Field, Textarea, Alert, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { setCaseHiddenAction, deleteCaseAction, summarizeCaseDiscussionAction, requestCaseHintAction } from "@/lib/actions/cases";
import type { CaseStatus } from "@/lib/status-labels-cases";

/** Olgu işlemleri: gizle/aç (personel), sil (yazar veya personel), tartışma özeti (personel, YZ). */
export function CaseActions({ caseId, status, isStaff, isAuthor, aiAvailable }: { caseId: string; status: CaseStatus; isStaff: boolean; isAuthor: boolean; aiAvailable: boolean }) {
  const items: React.ReactNode[] = [];
  if (isStaff) {
    items.push(
      status === "PUBLISHED" ? (
        <ActionForm key="hide" action={setCaseHiddenAction} hidden={{ id: caseId, hidden: "1" }} submitLabel="Olguyu gizle" variant="outline" size="sm" confirm="Olgu asistanlardan gizlenecek; tartışma korunur. Devam edilsin mi?" />
      ) : (
        <ActionForm key="unhide" action={setCaseHiddenAction} hidden={{ id: caseId, hidden: "0" }} submitLabel="Yeniden tartışmaya aç" variant="secondary" size="sm" />
      ),
    );
    items.push(
      aiAvailable ? (
        <ActionForm key="summary" action={summarizeCaseDiscussionAction} hidden={{ id: caseId }} submitLabel="Yapay zekâ ile tartışmayı özetle" variant="secondary" size="sm" />
      ) : (
        <p key="summary-na" className="text-xs text-ink-muted">
          Yapay zekâ yapılandırılmamış; tartışma özeti üretilemez.
        </p>
      ),
    );
  }
  if (isStaff || isAuthor) {
    items.push(<ActionForm key="delete" action={deleteCaseAction} hidden={{ id: caseId }} submitLabel="Olguyu sil" variant="danger" size="sm" confirm="Olgu, görselleri, ses kaydı ve tüm tartışma kalıcı olarak silinecek. Devam edilsin mi?" />);
  }
  if (items.length === 0) return null;
  return <div className="flex flex-wrap items-start gap-3">{items}</div>;
}

/** Asistan için Sokratik ipucu isteği. */
export function CaseHintRequest({ caseId, aiAvailable, locked }: { caseId: string; aiAvailable: boolean; locked: boolean }) {
  return (
    <Card className="border-violet-200 dark:border-violet-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" /> Düşünme ipucu iste (YZ)
        </CardTitle>
        <CardDescription>Yapay zekâ kesin tanı söylemez; akıl yürütmenizi yönlendiren Sokratik sorular verir. Yanıt tartışmaya eklenir ve etiketlenir.</CardDescription>
      </CardHeader>
      <CardContent>
        {!aiAvailable ? (
          <Alert tone="info">Yapay zekâ yapılandırılmamış; ipucu özelliği şu anda kullanılamıyor.</Alert>
        ) : locked ? (
          <Alert tone="info">Tartışma sonlandırıldı; ipucu istenemez.</Alert>
        ) : (
          <ActionForm action={requestCaseHintAction} hidden={{ id: caseId }} submitLabel="İpucu iste" variant="secondary">
            <Field label="Sorunuz veya kendi akıl yürütmeniz" htmlFor="question" hint="Örn. “Ön segment bulgularıyla arka segment bulgularını nasıl ilişkilendirebilirim?”">
              <Textarea id="question" name="question" rows={3} required minLength={10} maxLength={3000} />
            </Field>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}
