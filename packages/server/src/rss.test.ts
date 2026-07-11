import { describe, expect, it } from "vitest";
import { createParser, mapItems, MAX_NEWSLETTER_ITEMS, type RssItem } from "./rss";

// Fixture RSS montado à mão (sem rede): cobre parse+map, recência, dedupe,
// extração de imagem (media:content) e atribuição de ids. Datas são calculadas
// em runtime pra o teste de recência não "envelhecer".
const SETOR = "Inteligência Artificial";
const VEICULO = "Feed de Teste";

const rfc = (d: Date) => d.toUTCString();
const NOW = rfc(new Date());
const OLD = rfc(new Date(Date.now() - 60 * 86_400_000)); // 60 dias atrás

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Feed de Teste</title>
    <item>
      <title>  Alpha lança modelo  </title>
      <link>https://EX.com/a</link>
      <pubDate>${NOW}</pubDate>
      <description>&lt;p&gt;Alpha &lt;b&gt;lança&lt;/b&gt; um modelo grande.&lt;/p&gt;</description>
      <media:content url="https://img.example/a.jpg" />
    </item>
    <item>
      <title>Alpha manchete duplicada</title>
      <link>https://ex.com/a/</link>
      <pubDate>${NOW}</pubDate>
      <description>mesma URL canônica que o item Alpha</description>
    </item>
    <item>
      <title>Beta antigo</title>
      <link>https://ex.com/b</link>
      <pubDate>${OLD}</pubDate>
      <description>notícia velha, fora da janela</description>
    </item>
    <item>
      <title>Delta novidade</title>
      <link>https://ex.com/d</link>
      <pubDate>${NOW}</pubDate>
      <description>sem imagem nenhuma</description>
    </item>
  </channel>
</rss>`;

async function parseFixture(): Promise<RssItem[]> {
  const feed = await createParser().parseString(FIXTURE_XML);
  return feed.items;
}

describe("rss mapItems", () => {
  it("faz parse e mapeia para NewsletterItem (topic/source/título/url canônica/summary sem HTML)", async () => {
    const items = mapItems(await parseFixture(), SETOR, VEICULO, 7);
    const alpha = items.find((i) => i.title.startsWith("Alpha"));
    expect(alpha).toBeDefined();
    expect(alpha!.topic).toBe(SETOR);
    expect(alpha!.source).toBe(VEICULO);
    expect(alpha!.title).toBe("Alpha lança modelo"); // trim
    expect(alpha!.url).toBe("https://ex.com/a"); // host minúsculo, sem barra final
    expect(alpha!.entities).toEqual([]);
    expect(alpha!.summary).not.toContain("<"); // HTML stripado
    expect(alpha!.summary).toContain("Alpha");
  });

  it("descarta item mais velho que a janela (recência) mantendo os recentes", async () => {
    const items = mapItems(await parseFixture(), SETOR, VEICULO, 7);
    expect(items.some((i) => i.title === "Beta antigo")).toBe(false);
    expect(items.some((i) => i.title === "Delta novidade")).toBe(true);
  });

  it("deduplica por url canônica (barra final / host), mantendo o primeiro", async () => {
    const items = mapItems(await parseFixture(), SETOR, VEICULO, 7);
    expect(items.filter((i) => i.url === "https://ex.com/a")).toHaveLength(1);
    // o 1º item (com imagem) é o mantido, não o duplicado
    expect(items.find((i) => i.url === "https://ex.com/a")!.title).toBe("Alpha lança modelo");
  });

  it("extrai imagem de media:content; item sem imagem fica com imageUrl undefined", async () => {
    const items = mapItems(await parseFixture(), SETOR, VEICULO, 7);
    const alpha = items.find((i) => i.url === "https://ex.com/a");
    const delta = items.find((i) => i.title === "Delta novidade");
    expect(alpha!.imageUrl).toBe("https://img.example/a.jpg");
    expect(delta!.imageUrl).toBeUndefined();
  });

  it("atribui ids locais r1..rN na ordem final (após dedupe/cap)", async () => {
    const items = mapItems(await parseFixture(), SETOR, VEICULO, 7);
    // sobram Alpha e Delta (Beta é velho, a duplicata some) → r1, r2
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(["r1", "r2"]);
  });

  it("mantém item sem data parseável (leniente) e respeita o cap", async () => {
    const raw: RssItem[] = Array.from({ length: MAX_NEWSLETTER_ITEMS + 4 }, (_, i) => ({
      title: `Item ${i}`,
      link: `https://ex.com/n${i}`,
      // sem pubDate/isoDate → data não parseável, deve ser mantido
    }));
    const items = mapItems(raw, SETOR, VEICULO, 7);
    expect(items).toHaveLength(MAX_NEWSLETTER_ITEMS); // cap aplicado
    expect(items.every((i) => i.publishedAt === "")).toBe(true);
  });
});
