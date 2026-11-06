import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSearchTerm, parsePubmedXml, scoreRecord, journalTier, notablePubTypes, scanReason, stripXml } from "@/lib/articles/pubmed";

const MINI = `<?xml version="1.0"?><PubmedArticleSet>
<PubmedArticle><MedlineCitation><PMID Version="1">40000001</PMID><Article>
<Journal><JournalIssue><PubDate><Year>2026</Year><Month>Oct</Month></PubDate></JournalIssue><Title>Ophthalmology</Title><ISOAbbreviation>Ophthalmology</ISOAbbreviation></Journal>
<ArticleTitle>Selective laser trabeculoplasty versus drops: a randomised trial.</ArticleTitle>
<ELocationID EIdType="doi" ValidYN="Y">10.1016/j.ophtha.2026.01.001</ELocationID>
<Abstract><AbstractText Label="PURPOSE">To compare SLT &amp; drops.</AbstractText><AbstractText Label="RESULTS">IOP fell by 25&#37;.</AbstractText></Abstract>
<AuthorList><Author><LastName>Gazzard</LastName><Initials>G</Initials></Author><Author><CollectiveName>LiGHT Trial Study Group</CollectiveName></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D016449">Randomized Controlled Trial</PublicationType><PublicationType UI="D016448">Multicenter Study</PublicationType></PublicationTypeList>
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">40000001</ArticleId></ArticleIdList>
<ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9999/not-this-one</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">40000002</PMID><Article>
<Journal><JournalIssue><PubDate><MedlineDate>2026 Sep-Oct</MedlineDate></PubDate></JournalIssue><Title>Some Journal</Title><ISOAbbreviation>Some J</ISOAbbreviation></Journal>
<ArticleTitle>A narrative overview</ArticleTitle>
<PublicationTypeList><PublicationType UI="D016454">Review</PublicationType></PublicationTypeList>
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1234/abc</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
</PubmedArticleSet>`;

describe("pubmed", () => {
  it("arama terimine dil, özet ve kanıt filtresi ekler", () => {
    const t = buildSearchTerm("glaucoma[tiab]", { highEvidenceOnly: true });
    expect(t).toContain("(glaucoma[tiab])");
    expect(t).toContain("english[la]");
    expect(t).toContain("meta-analysis[pt]");
    expect(buildSearchTerm("x", { highEvidenceOnly: false })).toContain("clinical trial[pt]");
  });

  it("efetch XML'inden künye çıkarır, kaynakçadaki DOI'yi almaz", () => {
    const r = parsePubmedXml(MINI);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      pmid: "40000001",
      title: "Selective laser trabeculoplasty versus drops: a randomised trial",
      journalAbbrev: "Ophthalmology",
      publishedOn: "2026 Eki",
      doi: "10.1016/j.ophtha.2026.01.001",
      authors: "Gazzard G, LiGHT Trial Study Group",
    });
    expect(r[0].abstract).toBe("Purpose: To compare SLT & drops.\nResults: IOP fell by 25%.");
    expect(r[0].pubTypes).toContain("Randomized Controlled Trial");
    expect(r[1].doi).toBe("10.1234/abc");
    expect(r[1].publishedOn).toBe("2026 Sep-Oct");
  });

  it("gerçek PubMed çıktısında kaynakça DOI'lerini atlar", () => {
    const xml = readFileSync(path.join(__dirname, "fixtures/pubmed-sample.xml"), "utf8");
    const r = parsePubmedXml(xml);
    expect(r.length).toBe(2);
    for (const a of r) {
      expect(a.pmid).toMatch(/^\d+$/);
      expect(a.title.length).toBeGreaterThan(10);
      expect(a.abstract.length).toBeGreaterThan(50);
    }
    expect(r.map((a) => a.doi)).not.toContain("10.1016/S0140-6736(20)32160-7");
  });

  it("RKÇ + üst dergi derlemeden yüksek puan alır ve puan 0-100 arasında kalır", () => {
    const [rct, review] = parsePubmedXml(MINI);
    const a = scoreRecord(rct);
    const b = scoreRecord(review);
    expect(a).toBeGreaterThan(b);
    expect(a).toBeLessThanOrEqual(100);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(journalTier("JAMA Ophthalmol")).toBe(30);
    expect(journalTier("Clin Exp Optom")).toBeLessThan(14);
  });

  it("yayın türlerini Türkçe etiketler ve gerekçe üretir", () => {
    expect(notablePubTypes(["Journal Article", "Randomized Controlled Trial", "Meta-Analysis"])).toEqual(["Meta-Analysis", "Randomized Controlled Trial"]);
    expect(scanReason({ pubTypes: ["Meta-Analysis"], journal: "Ophthalmology" }, "Glokom")).toBe("Meta-analiz · Ophthalmology · Glokom taraması");
    expect(stripXml("A &lt;b&gt; &amp; <i>c</i>")).toBe("A <b> & c");
  });
});
