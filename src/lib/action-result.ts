/** Server action'ların ortak dönüş tipi. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function success<T>(data?: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

/** Zod hatasını alan hatalarına çevirir. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) {
    const k = i.path.join(".") || "_";
    (out[k] ??= []).push(i.message);
  }
  return out;
}
