"use client";

import { useActionState } from "react";
import { changeUserRoleAction, setUserStatusAction, endUserSessionsAction, resetUserMfaAction } from "@/lib/actions/admin";
import { Select, SubmitButton } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

const ROLES: { value: "ADMIN" | "FACULTY" | "RESIDENT"; label: string }[] = [
  { value: "ADMIN", label: "Yönetici" },
  { value: "FACULTY", label: "Öğretim Üyesi" },
  { value: "RESIDENT", label: "Asistan Hekim" },
];

export function UserRowActions({ user, isSelf }: { user: { id: string; role: "ADMIN" | "FACULTY" | "RESIDENT"; status: "ACTIVE" | "SUSPENDED"; mfaEnabled: boolean }; isSelf: boolean }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(changeUserRoleAction, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex items-center gap-1.5">
        <input type="hidden" name="id" value={user.id} />
        <Select name="role" defaultValue={user.role} disabled={isSelf} aria-label="Rol" className="h-8 w-40 py-1 text-xs">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <SubmitButton size="sm" variant="outline" disabled={isSelf}>
          Kaydet
        </SubmitButton>
      </form>
      <form action={setUserStatusAction}>
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="status" value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
        <SubmitButton size="sm" variant={user.status === "ACTIVE" ? "danger" : "secondary"} disabled={isSelf}>
          {user.status === "ACTIVE" ? "Askıya al" : "Etkinleştir"}
        </SubmitButton>
      </form>
      <form action={endUserSessionsAction}>
        <input type="hidden" name="id" value={user.id} />
        <SubmitButton size="sm" variant="ghost">
          Oturumları sonlandır
        </SubmitButton>
      </form>
      <form action={resetUserMfaAction}>
        <input type="hidden" name="id" value={user.id} />
        <SubmitButton size="sm" variant="ghost" disabled={!user.mfaEnabled} title={!user.mfaEnabled ? "MFA etkin değil" : "TOTP sırrını ve kurtarma kodlarını siler"}>
          MFA&apos;yı sıfırla
        </SubmitButton>
      </form>
      {state && (
        <span className={state.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"} role="status">
          {state.ok ? state.message : state.error}
        </span>
      )}
    </div>
  );
}
