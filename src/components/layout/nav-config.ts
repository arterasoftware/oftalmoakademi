import type { UserRole } from "@/db/schema";

export type NavTone = "brand" | "clinical" | "exam" | "ai" | "neutral";
export type NavItem = { href: string; label: string; icon: string; roles?: UserRole[]; tone?: NavTone; description?: string };
export type NavSection = { label: string; items: NavItem[] };

/**
 * Ana gezinme: bölümlere ayrılmış, her modülün hafif bir rengi var (konum göstergesi ve yapı ayrımı için).
 * `icon` lucide-react ikon adıdır (app-nav içinde eşlenir).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Eğitim",
    items: [
      { href: "/panel", label: "Ana Sayfa", icon: "home", tone: "neutral", description: "Bu haftanın programı" },
      { href: "/dersler", label: "Dersler", icon: "book-open", tone: "brand", description: "Haftalık dersler ve materyaller" },
      { href: "/makaleler", label: "Makaleler", icon: "newspaper", tone: "brand", description: "Haftanın makalesi (Journal Club)" },
      { href: "/olgular", label: "Olgular", icon: "stethoscope", tone: "clinical", description: "Klinik olgu tartışmaları" },
      { href: "/sinavlar", label: "Sınavlar", icon: "clipboard-check", tone: "exam", description: "Haftalık ve aylık sınavlar" },
    ],
  },
  {
    label: "Araçlar",
    items: [
      { href: "/asistan", label: "YZ Asistanı", icon: "sparkles", tone: "ai", description: "Kaynak temelli soru-cevap" },
      { href: "/sss", label: "Sık Sorulanlar", icon: "circle-help", tone: "ai", description: "Öğretim üyesi yanıtları" },
      { href: "/takvim", label: "Takvim", icon: "calendar", tone: "neutral", description: "Eğitim takvimi" },
    ],
  },
  {
    label: "Eğitim yönetimi",
    items: [
      { href: "/asistanlar", label: "Asistanlar", icon: "users", roles: ["ADMIN", "FACULTY"], tone: "exam", description: "Gelişim raporları" },
      { href: "/kaynaklar", label: "Kaynaklar", icon: "library", roles: ["ADMIN", "FACULTY"], tone: "ai", description: "Bilimsel kaynaklar (RAG)" },
      { href: "/yonetim", label: "Yönetim", icon: "settings", roles: ["ADMIN"], tone: "neutral", description: "Kullanıcılar ve ayarlar" },
    ],
  },
];

/** Düz liste (geriye dönük uyumluluk) */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Gezinmede olmayan sayfalar için konum etiketleri */
export const EXTRA_LOCATIONS: NavItem[] = [
  { href: "/profil", label: "Profilim", icon: "user", tone: "neutral" },
  { href: "/bildirimler", label: "Bildirimler", icon: "bell", tone: "neutral" },
];

/** Mobil alt çubukta gösterilecek 5 öğe. */
export const MOBILE_NAV_HREFS = ["/panel", "/dersler", "/olgular", "/sinavlar", "/asistan"];

export function findLocation(pathname: string): NavItem | undefined {
  const all = [...NAV_ITEMS, ...EXTRA_LOCATIONS];
  return all.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
}

/** Alt sayfa etiketleri (ikinci kırıntı) */
export function subLocationLabel(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  const map: Record<string, string> = {
    yeni: "Yeni",
    duzenle: "Düzenle",
    etkilesimli: "Etkileşimli ders",
    oneriler: "Öneriler",
    kullanicilar: "Kullanıcılar",
    davetler: "Davetler",
    kaynaklar: "Kaynaklar",
    denetim: "Denetim kayıtları",
    "yz-ayarlari": "Yapay zekâ ayarları",
    kullanim: "Kullanım",
  };
  if (map[last]) return map[last];
  if (/^[0-9a-f-]{36}$/i.test(last)) return "Ayrıntı";
  return null;
}
