import { listLessonMaterials } from "@/lib/queries/materials";
import { MaterialCard } from "./material-card";

/** Ders detayında materyal listesi (sunucu bileşeni). */
export async function MaterialsViewer({ lessonId }: { lessonId: string }) {
  const materials = await listLessonMaterials(lessonId);
  if (materials.length === 0) return null;
  return (
    <section className="mt-6" aria-labelledby="materyaller">
      <h2 id="materyaller" className="mb-3 text-lg font-semibold text-ink">
        Ders materyalleri <span className="text-sm font-normal text-ink-muted">({materials.length})</span>
      </h2>
      <div className="space-y-3">
        {materials.map((m) => (
          <MaterialCard key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}
