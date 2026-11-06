import { z } from "zod";

/**
 * Zod şemasını Gemini'nin kabul ettiği JSON Schema alt kümesine dönüştürür:
 *  - `$schema`, `additionalProperties` kaldırılır
 *  - `anyOf: [X, {type:"null"}]` -> X + `nullable: true`
 *  - `$ref`/`$defs` çözülür (yineleyen şemalar düzleştirilir)
 */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { reused: "inline", unrepresentable: "any" }) as Record<string, unknown>;
  return clean(raw) as Record<string, unknown>;
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const obj = { ...(node as Record<string, unknown>) };
  delete obj.$schema;
  delete obj.additionalProperties;
  delete obj.$defs;
  delete obj.$id;

  // nullable birleşimleri sadeleştir
  if (Array.isArray(obj.anyOf)) {
    const variants = obj.anyOf as Record<string, unknown>[];
    const nonNull = variants.filter((v) => v.type !== "null");
    if (nonNull.length === 1 && variants.length === 2) {
      const merged: Record<string, unknown> = { ...(clean(nonNull[0]) as Record<string, unknown>), nullable: true };
      for (const k of Object.keys(obj)) if (k !== "anyOf" && !(k in merged)) merged[k] = obj[k];
      return merged;
    }
    obj.anyOf = variants.map(clean);
  }
  if (Array.isArray(obj.type)) {
    const types = obj.type as string[];
    if (types.includes("null")) {
      obj.nullable = true;
      obj.type = types.filter((t) => t !== "null")[0] ?? "string";
    }
  }
  for (const k of ["properties", "items", "oneOf", "allOf"] as const) {
    if (k in obj) {
      const v = obj[k];
      obj[k] = k === "properties" && v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, clean(pv)])) : clean(v);
    }
  }
  return obj;
}
