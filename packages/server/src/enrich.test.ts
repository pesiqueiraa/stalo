import { describe, expect, it, vi } from "vitest";
import type { NewsletterItem } from "@stalo/shared";
import {
  enrichItems,
  fetchOgImage,
  googleNewsArticleId,
  parseBatchExecuteUrl,
  parseOgImage,
  parseSignature,
  resolveGoogleNewsUrl,
} from "./enrich";

// ---------- parsers puros (fixtures de string — sem rede) ----------

describe("enrich parsers", () => {
  it("googleNewsArticleId extrai o id do path /rss/articles/{id}", () => {
    expect(googleNewsArticleId("https://news.google.com/rss/articles/CBMiabc123?oc=5")).toBe("CBMiabc123");
    expect(googleNewsArticleId("https://veiculo.com/artigo")).toBeNull();
  });

  it("parseSignature lê data-n-a-sg e data-n-a-ts do HTML", () => {
    const html = `<c-wiz data-n-a-sg="ABC_sig123" data-n-a-ts="1720600000000"></c-wiz>`;
    expect(parseSignature(html)).toEqual({ sg: "ABC_sig123", ts: "1720600000000" });
    // faltando um dos dois → null
    expect(parseSignature(`<c-wiz data-n-a-sg="soASsinatura"></c-wiz>`)).toBeNull();
  });

  it("parseBatchExecuteUrl extrai a URL real escapada da resposta", () => {
    // resposta JSON-em-JSON escapada (as aspas vêm com barra)
    const body =
      ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://valor.globo.com/financas/drex.ghtml\\",null]",null,null,null,"generic"]]';
    expect(parseBatchExecuteUrl(body)).toBe("https://valor.globo.com/financas/drex.ghtml");
    // sem a marca garturlres → null
    expect(parseBatchExecuteUrl('[["wrb.fr","Fbv4je","[]"]]')).toBeNull();
  });

  it("parseOgImage aceita property/name, og:image/og:image:url e content antes ou depois", () => {
    expect(parseOgImage(`<meta property="og:image" content="https://cdn.site/a.jpg" />`)).toBe(
      "https://cdn.site/a.jpg",
    );
    // content ANTES do property
    expect(parseOgImage(`<meta content="https://cdn.site/b.jpg" property="og:image">`)).toBe(
      "https://cdn.site/b.jpg",
    );
    // name= em vez de property=
    expect(parseOgImage(`<meta name="og:image" content="https://cdn.site/c.jpg">`)).toBe(
      "https://cdn.site/c.jpg",
    );
    // og:image:url
    expect(parseOgImage(`<meta property="og:image:url" content="https://cdn.site/d.jpg">`)).toBe(
      "https://cdn.site/d.jpg",
    );
    // sem og:image → null (e não confunde com og:image:width)
    expect(parseOgImage(`<meta property="og:image:width" content="1200">`)).toBeNull();
    expect(parseOgImage(`<html>sem imagem</html>`)).toBeNull();
  });
});

// ---------- rede com fetch injetado (sem rede real) ----------

describe("enrich rede (fetch injetado)", () => {
  it("resolveGoogleNewsUrl encadeia GET (assinatura) + POST (URL real)", async () => {
    const fake: typeof fetch = (async (url: unknown) => {
      if (String(url).includes("/rss/articles/")) {
        return new Response(`<c-wiz data-n-a-sg="SIG" data-n-a-ts="1720000000000"></c-wiz>`, { status: 200 });
      }
      return new Response(
        '[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://real.com/artigo\\"]"]]',
        { status: 200 },
      );
    }) as typeof fetch;
    const url = await resolveGoogleNewsUrl("https://news.google.com/rss/articles/ID123", fake);
    expect(url).toBe("https://real.com/artigo");
  });

  it("resolveGoogleNewsUrl → null quando a página não traz assinatura (item segue com GN)", async () => {
    const fake: typeof fetch = (async () => new Response("<html>sem assinatura</html>", { status: 200 })) as typeof fetch;
    expect(await resolveGoogleNewsUrl("https://news.google.com/rss/articles/ID123", fake)).toBeNull();
  });

  it("resolveGoogleNewsUrl → null em erro de rede (nunca lança)", async () => {
    const fake: typeof fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    expect(await resolveGoogleNewsUrl("https://news.google.com/rss/articles/ID123", fake)).toBeNull();
  });

  it("fetchOgImage extrai og:image e resolve URL relativa contra o artigo", async () => {
    const fake: typeof fetch = (async () =>
      new Response(`<meta property="og:image" content="/img/hero.jpg">`, { status: 200 })) as typeof fetch;
    expect(await fetchOgImage("https://veiculo.com/noticia/x", fake)).toBe("https://veiculo.com/img/hero.jpg");
  });

  it("fetchOgImage → null em status ruim", async () => {
    const fake: typeof fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    expect(await fetchOgImage("https://veiculo.com/x", fake)).toBeNull();
  });
});

// ---------- enrichItems com dependências injetadas ----------

const makeItem = (over: Partial<NewsletterItem>): NewsletterItem => ({
  id: "r1",
  topic: "Fintech",
  title: "t",
  summary: "",
  source: "Google News",
  url: "https://news.google.com/rss/articles/ID1",
  entities: [],
  publishedAt: "2026-07-10",
  ...over,
});

describe("enrichItems", () => {
  it("resolve URL real dos itens Google News e não toca nos demais", async () => {
    const items = [
      makeItem({ id: "r1", url: "https://news.google.com/rss/articles/ID1" }),
      makeItem({ id: "r2", url: "https://veiculo.com/ja-real", imageUrl: "https://x/y.jpg" }),
    ];
    const out = await enrichItems(items, {
      resolveUrl: async () => "https://valor.com/real",
      fetchImage: async () => null,
    });
    expect(out[0].url).toBe("https://valor.com/real");
    expect(out[1].url).toBe("https://veiculo.com/ja-real"); // não-GN, intacto
    expect(out).toHaveLength(2); // nada descartado
  });

  it("falha ao resolver → item mantém o link do Google News (regra dura)", async () => {
    const items = [makeItem({ url: "https://news.google.com/rss/articles/ID1" })];
    const out = await enrichItems(items, { resolveUrl: async () => null, fetchImage: async () => null });
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://news.google.com/rss/articles/ID1");
  });

  it("busca og:image só pra item sem imagem e com URL real não-Google", async () => {
    const items = [
      makeItem({ id: "r1", url: "https://news.google.com/rss/articles/ID1" }), // resolve → depois pega imagem
      makeItem({ id: "r2", url: "https://outro.com/x", imageUrl: "https://ja/tem.jpg" }), // já tem imagem
    ];
    const fetchImage = vi.fn(async () => "https://og/found.jpg");
    const out = await enrichItems(items, {
      resolveUrl: async () => "https://valor.com/real",
      fetchImage,
    });
    expect(out[0].url).toBe("https://valor.com/real");
    expect(out[0].imageUrl).toBe("https://og/found.jpg");
    expect(out[1].imageUrl).toBe("https://ja/tem.jpg"); // intacto
    // só r1 (sem imagem, url real) foi buscado, com a URL JÁ resolvida
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith("https://valor.com/real");
  });

  it("falha na og:image → item segue sem imagem, intacto", async () => {
    const items = [makeItem({ url: "https://veiculo.com/x", source: "Veículo" })];
    const out = await enrichItems(items, { resolveUrl: async () => null, fetchImage: async () => null });
    expect(out[0].imageUrl).toBeUndefined();
    expect(out[0].url).toBe("https://veiculo.com/x");
    expect(out[0].source).toBe("Veículo");
  });
});
