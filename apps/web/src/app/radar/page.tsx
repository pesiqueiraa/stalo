"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Header } from "@/components/Header";
import { TopicsPanel } from "@/components/TopicsPanel";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ScanLoader } from "@/components/ScanLoader";
import { DetailPanel } from "@/components/DetailPanel";
import { IdeasPanel } from "@/components/IdeasPanel";
import { Toast, type ToastAction } from "@/components/Toast";
import { DeepDiveView } from "@/components/DeepDiveView";
import { Brief } from "@/components/Brief";
import {
  createIdea,
  createTopic,
  deleteIdea,
  deleteTopic,
  fetchIdeas,
  fetchLatestScan,
  fetchTopics,
  requestDeepDive,
  requestFinancials,
  requestScan,
} from "@/lib/api";
import { buildGraph } from "@/lib/graph";
import { insightKey } from "@/lib/ui";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  setGraphSettings,
  subscribeSettings,
} from "@/lib/settings";
import {
  MAX_TOPICS,
  type Graph,
  type GraphNode,
  type InsightNode,
  type NewsItem,
  type NewsNode,
  type SavedIdea,
  type Topic,
} from "@stalo/shared";

const EMPTY_GRAPH: Graph = { nodes: [], links: [] };
type View = "rede" | "brief";

export default function Home() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(30); // janela de recência do scan (30/60/90 ou null = sem limite)
  const [view, setView] = useState<View>("rede"); // rede-first: o usuário vê primeiro o mapa das conexões, depois o brief
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [highlightedIdeaId, setHighlightedIdeaId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // preferências de visualização do grafo, lidas do localStorage via store
  // externo. O server usa o snapshot default e o client reconcilia sozinho —
  // sem mismatch de hidratação nem setState dentro de effect.
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  // painel de ideias salvas recolhível — dá mais espaço pro grafo quando fechado
  const [ideasOpen, setIdeasOpen] = useState(true);
  // "Mergulhar": id em geração (loading) e id do mergulho aberto na tela
  const [divingId, setDivingId] = useState<string | null>(null);
  const [openDiveId, setOpenDiveId] = useState<string | null>(null);
  // "Aprofundar" (financeiro, 2º nível): id em geração
  const [financingId, setFinancingId] = useState<string | null>(null);
  // manchete que surge ao fim da revelação do grafo, anunciando o que foi achado
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => bannerTimers.current.forEach(clearTimeout), []);

  // carrega o estado persistido ao abrir a página: temas, ideias salvas e o
  // último scan (que o client remonta em grafo com as cores dos temas atuais).
  // Tudo isso é leitura direta do localStorage (apps/web/src/lib/storage.ts,
  // sem I/O de rede) — visitante novo recebe listas vazias e cai no estado
  // vazio do painel ("adicione temas ao lado"), que é a porta de entrada desde
  // que o onboarding saiu. `readTopics`/`readIdeas` nunca lançam (o pior caso é
  // o vazio), mas a rede de segurança fica: qualquer coisa inesperada aqui
  // mostra uma mensagem em vez de deixar a tela em branco.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedTopics, loadedIdeas, latest] = await Promise.all([
          fetchTopics(),
          fetchIdeas(),
          fetchLatestScan(),
        ]);
        if (cancelled) return;
        setTopics(loadedTopics);
        setIdeas(loadedIdeas);
        if (latest.result) {
          setGraph(buildGraph(latest.result, loadedTopics.map((t) => t.name)));
          setLastUpdated(latest.createdAt);
        }
        setError(null);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setError("Não consegui carregar seus dados salvos agora. Tente recarregar a página.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function flashMessage(message: string, action?: ToastAction) {
    setToast({ message, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // toasts com ação (ex: desfazer) ficam mais tempo, pra dar chance de reagir
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2400);
  }

  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }

  async function addTopic(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (topics.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    if (topics.length >= MAX_TOPICS) {
      flashMessage(`Máximo de ${MAX_TOPICS} temas por vez.`);
      return;
    }
    try {
      const created = await createTopic(trimmed);
      setTopics((prev) => [...prev, created]);
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "Não consegui adicionar o tema.");
    }
  }

  async function removeTopic(id: string) {
    const previous = topics;
    setTopics((prev) => prev.filter((t) => t.id !== id)); // otimista
    try {
      await deleteTopic(id);
    } catch {
      setTopics(previous); // desfaz em caso de falha
      flashMessage("Não consegui remover o tema.");
    }
  }

  const handleSelect = useCallback((node: GraphNode) => setSelectedNode(node), []);

  async function scan() {
    if (loading) return;
    setLoading(true);
    setError(null);
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    setBanner(null);
    try {
      const topicNames = topics.slice(0, MAX_TOPICS).map((t) => t.name);
      const { result, persisted } = await requestScan(topicNames, days);
      setGraph(buildGraph(result, topics.map((t) => t.name)));
      setLastUpdated(new Date().toISOString());
      // a manchete entra quando os insights terminam de estourar (fim do stagger)
      // e some depois de alguns segundos
      if (result.insights.length > 0) {
        const n = result.insights.length;
        const text = `${n} ${n === 1 ? "conexão" : "conexões"} entre seus temas`;
        bannerTimers.current.push(setTimeout(() => setBanner(text), 1500));
        bannerTimers.current.push(setTimeout(() => setBanner(null), 6500));
      }
      // o scan aconteceu e já custou a chamada de IA — se só o salvamento
      // falhou (cota cheia, modo privado), o resultado fica na tela mesmo
      // assim, só avisa que ele não sobrevive a um reload.
      if (!persisted) {
        flashMessage("Não consegui guardar este scan no navegador; ele some se você recarregar a página.");
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não consegui buscar ou interpretar as notícias agora. Tente novamente em instantes.",
      );
    }
    setLoading(false);
  }

  async function saveIdea(node: GraphNode, notes: string) {
    if (node.kind !== "insight") return;
    const key = insightKey(node.insightType, node.title);
    if (ideas.some((i) => insightKey(i.type, i.title) === key)) {
      flashMessage("Essa ideia já está salva.");
      return;
    }
    // retrato das notícias relacionadas no momento do save — sem isso, a
    // ideia perde todo o contexto assim que um novo scan substitui o grafo
    // (ver artefatos/notas.md, "Ideia salva perde contexto com o tempo")
    const relatedItems: NewsItem[] = graph.nodes
      .filter((n): n is Extract<GraphNode, { kind: "news" }> =>
        n.kind === "news" && node.related.includes(n.id),
      )
      .map((n) => ({
        id: n.id,
        topic: n.topic,
        title: n.title,
        summary: n.summary,
        source: n.source,
        url: n.url,
        entities: n.entities,
        publishedAt: n.publishedAt,
      }));
    try {
      const saved = await createIdea({
        insightRef: node.id,
        type: node.insightType,
        title: node.title,
        description: node.description,
        rationale: node.rationale,
        whyNow: node.whyNow,
        soWhat: node.soWhat,
        notes,
        relatedItems,
      });
      setIdeas((prev) => [saved, ...prev]);
      flashMessage("Ideia salva ✓");
      setSelectedNode(null);
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "Não consegui salvar a ideia.");
    }
  }

  async function removeIdea(id: string) {
    const index = ideas.findIndex((i) => i.id === id);
    if (index === -1) return;
    const removed = ideas[index];
    setIdeas((prev) => prev.filter((i) => i.id !== id)); // otimista
    // o card some do DOM sem disparar mouseleave — sem isso o destaque
    // no grafo ficaria preso na ideia removida.
    setHighlightedIdeaId((current) => (current === id ? null : current));
    try {
      await deleteIdea(id);
    } catch {
      setIdeas((prev) => (prev.some((i) => i.id === removed.id) ? prev : [...prev.slice(0, index), removed, ...prev.slice(index)]));
      flashMessage("Não consegui remover a ideia.");
      return;
    }
    // ideia salva é o output do produto (e carrega o snapshot de contexto),
    // então apagar sem volta é arriscado — oferece desfazer, recriando a ideia.
    flashMessage("Ideia removida", {
      label: "Desfazer",
      onClick: async () => {
        dismissToast();
        try {
          const restored = await createIdea({
            insightRef: removed.insightRef,
            type: removed.type,
            title: removed.title,
            description: removed.description,
            rationale: removed.rationale,
            whyNow: removed.whyNow,
            soWhat: removed.soWhat,
            notes: removed.notes,
            relatedItems: removed.relatedItems,
          });
          setIdeas((prev) =>
            prev.some((i) => i.insightRef === restored.insightRef && i.id === restored.id)
              ? prev
              : [...prev.slice(0, index), restored, ...prev.slice(index)],
          );
        } catch {
          flashMessage("Não consegui desfazer a remoção.");
        }
      },
    });
  }

  // gera o mergulho (ou recupera do cache no cliente) e abre a tela. A rota
  // não busca mais a ideia — ela vai inteira no corpo, então achamos no
  // estado local pelo id que os componentes filhos mandam.
  async function dive(id: string) {
    if (divingId) return;
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setDivingId(id);
    try {
      const updated = await requestDeepDive(idea);
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setOpenDiveId(id);
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "Não consegui aprofundar a ideia.");
    } finally {
      setDivingId(null);
    }
  }

  // aprofunda no financeiro (2º nível) — a ideia já precisa estar mergulhada
  async function deepenFinancials(id: string) {
    if (financingId) return;
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setFinancingId(id);
    try {
      const updated = await requestFinancials(idea);
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "Não consegui gerar a análise financeira.");
    } finally {
      setFinancingId(null);
    }
  }

  const openDiveIdea = openDiveId ? ideas.find((i) => i.id === openDiveId) ?? null : null;

  // dados do brief, derivados do mesmo grafo (ScanResult é a fronteira única):
  // insights ranqueáveis, notícias para as fontes, e as chaves já salvas.
  const insights = graph.nodes.filter((n): n is InsightNode => n.kind === "insight");
  const newsNodes = graph.nodes.filter((n): n is NewsNode => n.kind === "news");
  const savedKeys = new Set(ideas.map((i) => insightKey(i.type, i.title)));

  // atividade do scan atual: quantas notícias cada tema gerou NESTE scan.
  // Contagem direta do último ScanResult — não é tendência (isso exigiria
  // histórico de scans, ver roadmap). null antes do primeiro scan = sem badge.
  const newsCounts = lastUpdated
    ? Object.fromEntries(
        topics.map((t) => [
          t.name,
          newsNodes.filter((n) => n.topic.toLowerCase() === t.name.toLowerCase()).length,
        ]),
      )
    : null;

  const alreadySaved =
    selectedNode?.kind === "insight"
      ? ideas.some(
          (i) => insightKey(i.type, i.title) === insightKey(selectedNode.insightType, selectedNode.title),
        )
      : false;

  return (
    <div id="app">
      <Header loading={loading} lastUpdated={lastUpdated} />
      <div className={`layout${ideasOpen ? "" : " ideas-collapsed"}`}>
        <TopicsPanel
          topics={topics}
          newsCounts={newsCounts}
          onAddTopic={addTopic}
          onRemoveTopic={removeTopic}
          onScan={scan}
          loading={loading}
          error={error}
          days={days}
          onDaysChange={setDays}
          settings={settings}
          onSettingsChange={setGraphSettings}
        />
        <div className="panel center-panel" style={{ padding: 0 }}>
          <div className="view-toggle" role="tablist" aria-label="Modo de visualização">
            <button
              role="tab"
              aria-selected={view === "rede"}
              className={`view-tab${view === "rede" ? " active" : ""}`}
              onClick={() => setView("rede")}
            >
              Rede
            </button>
            <button
              role="tab"
              aria-selected={view === "brief"}
              className={`view-tab${view === "brief" ? " active" : ""}`}
              onClick={() => setView("brief")}
            >
              Brief
            </button>
          </div>
          <div className="center-body">
            {view === "rede" ? (
              <div className="graph-wrap">
                <GraphCanvas
                  graph={graph}
                  onSelect={handleSelect}
                  highlightId={highlightedIdeaId}
                  settings={settings}
                />
                {graph.nodes.length === 0 && !loading && (
                  <div className="empty-state">
                    {lastUpdated === null ? (
                      <>
                        Adicione temas ao lado e clique em{" "}
                        <span>&quot;Atualizar notícias&quot;</span>
                        <br />
                        para o radar buscar conexões, tendências e lacunas entre eles.
                      </>
                    ) : (
                      <>
                        O radar não encontrou notícias ou conexões para esses temas dessa vez.
                        <br />
                        Tente ajustar os temas monitorados e clicar em{" "}
                        <span>&quot;Atualizar notícias&quot;</span> de novo.
                      </>
                    )}
                  </div>
                )}
                {banner && !loading && (
                  <div className="reveal-banner" role="status">
                    <span className="reveal-banner-dot" />
                    {banner}
                  </div>
                )}
                <DetailPanel
                  node={selectedNode}
                  newsNodes={newsNodes}
                  alreadySaved={alreadySaved}
                  onSave={saveIdea}
                  onClose={() => setSelectedNode(null)}
                />
              </div>
            ) : (
              <Brief
                insights={insights}
                newsNodes={newsNodes}
                savedKeys={savedKeys}
                hasScanned={lastUpdated !== null}
                onSave={saveIdea}
              />
            )}
            {loading && <ScanLoader />}
          </div>
        </div>
        {ideasOpen ? (
          <IdeasPanel
            ideas={ideas}
            topics={topics}
            divingId={divingId}
            onRemove={removeIdea}
            onHoverIdea={setHighlightedIdeaId}
            onDive={dive}
            onOpenDive={setOpenDiveId}
            onCollapse={() => setIdeasOpen(false)}
          />
        ) : (
          <button
            className="ideas-reopen"
            onClick={() => setIdeasOpen(true)}
            title="Mostrar ideias salvas"
            aria-label="Mostrar ideias salvas"
          >
            <span className="ideas-reopen-chevron" aria-hidden="true">
              ‹
            </span>
            <span className="ideas-reopen-label">
              Ideias salvas{ideas.length > 0 ? ` (${ideas.length})` : ""}
            </span>
          </button>
        )}
      </div>
      {openDiveIdea && (
        <DeepDiveView
          idea={openDiveIdea}
          financingId={financingId}
          onDeepenFinancials={deepenFinancials}
          onClose={() => setOpenDiveId(null)}
        />
      )}
      <Toast message={toast?.message ?? null} action={toast?.action} />
    </div>
  );
}
