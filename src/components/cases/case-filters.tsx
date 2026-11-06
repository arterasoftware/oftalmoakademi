"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, Label } from "@/components/ui/input";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { CASE_STATUS, type CaseStatus } from "@/lib/status-labels-cases";

/** Liste filtreleri: değişince URL sorgu parametrelerini günceller (sunucu yeniden sorgular). */
export function CaseFilters({ statuses }: { statuses: CaseStatus[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-md">
      <div>
        <Label htmlFor="f-altdal">Alt dal</Label>
        <Select id="f-altdal" value={params.get("altdal") ?? ""} onChange={(e) => set("altdal", e.target.value)}>
          <option value="">Tümü</option>
          {Object.entries(SUBSPECIALTY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      {statuses.length > 0 && (
      <div>
        <Label htmlFor="f-durum">Durum</Label>
        <Select id="f-durum" value={params.get("durum") ?? ""} onChange={(e) => set("durum", e.target.value)}>
          <option value="">Tümü</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {CASE_STATUS[s].label}
            </option>
          ))}
        </Select>
      </div>
      )}
    </div>
  );
}
