import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toGeminiSchema } from "@/lib/ai/gemini-schema";

describe("toGeminiSchema", () => {
  it("additionalProperties ve $schema alanlarını kaldırır, nullable birleşimleri sadeleştirir", () => {
    const schema = z.object({
      title: z.string(),
      body: z.string().nullable(),
      steps: z.array(z.object({ type: z.enum(["a", "b"]), n: z.number().nullable() })),
    });
    const out = toGeminiSchema(schema) as Record<string, unknown>;
    expect(out.$schema).toBeUndefined();
    expect(out.additionalProperties).toBeUndefined();
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.body.type).toBe("string");
    expect(props.body.nullable).toBe(true);
    const items = (props.steps.items as Record<string, unknown>);
    const itemProps = items.properties as Record<string, Record<string, unknown>>;
    expect(itemProps.n.nullable).toBe(true);
    expect(items.additionalProperties).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("anyOf");
  });
});
