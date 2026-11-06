import { Badge } from "@/components/ui";
import { SOURCE_STATUS_LABELS, type SourceStatus } from "@/lib/queries/sources";

const TONES: Record<SourceStatus, "neutral" | "info" | "success" | "danger"> = {
  PENDING: "neutral",
  PROCESSING: "info",
  READY: "success",
  FAILED: "danger",
};

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  return <Badge tone={TONES[status]}>{SOURCE_STATUS_LABELS[status]}</Badge>;
}

export function ApprovalBadge({ approved }: { approved: boolean }) {
  return approved ? <Badge tone="brand">Uzman onaylı</Badge> : <Badge tone="warning">Onay bekliyor</Badge>;
}
