"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Header } from "@/components/Header";
import { ThesisPanel } from "@/components/ThesisPanel";
import { GraphCanvas } from "@/components/GraphCanvas";
import { ScanLoader } from "@/components/ScanLoader";
import { DetailPanel } from "@/components/DetailPanel";
import { IdeasPanel } from "@/components/IdeasPanel";
import { Toast, type ToastAction } from "@/components/Toast";
import { DeepDiveView } from "@/components/DeepDiveView";
import { Brief } from "@/components/Brief";
import { VerdictView } from "@/components/VerdictView";
import { GringaFeed } from "@/components/GringaFeed";
import { verdictToScan } from "@/lib/verdict";
import { takePendingThesis } from "@/lib/thesisHandoff";
import {
  createIdea,
  createTopic,
  deleteIdea,
  deleteTopic,
  fetchIdeas,
  fetchLatestVerdict,
  fetchTopics,
  requestDeepDive,
  requestVerdict,
} from "@/lib/api";
import { buildGraph } from "@/lib/graph";
import { insightKey } from "@/lib/ui";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  setGraphSettings,
  subscribeSettings,
} from "@/lib/settings";
import type {
  Graph,
  GraphNode,
  InsightNode,
  NewsItem,
  NewsNode,
  SavedIdea,
  Topic,
  Verdict,
} from "@stalo/shared";

const MAX_TOPICS = 5;
const EMPTY_GRAPH: Graph = { nodes: [], links: [] };
type View = "veredito" | "rede" | "brief" | "gringa";

export default function Home() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // a tese é o input principal — "quero construir [build] para [forWhom]"
  const [thesisBuild, setThesisBuild] = useState("");
  const [thesisFor, setThesisFor] = useState("");
  // veredito gerado pelo backend real; null antes de gerar
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(30); // janela de recência do scan (30/60/90 ou null = sem limite)
  const [view, setView] = useState<View>("veredito"); // veredito-primeiro: o founder lê o parecer sobre a tese; a rede é a evidência atrás
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
  // manchete que surge ao fim da revelação do grafo, anunciando o que foi achado
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => bannerTimers.current.forEach(clearTimeout), []);

  // carrega o estado persistido ao abrir a página: temas, ideias salvas e o
  // último scan (que o client remonta em grafo com as cores dos temas atuais).
  // Usuário novo recebe listas vazias (nada a mostrar, sem erro). O único motivo
  // de falhar aqui é hiccup transitório do banco (ex.: cold-start da Supabase),
  // então tentamos de novo automaticamente antes de incomodar o usuário — em vez
  // de mandá-lo "recarregar a página", já que ele pode nem ter dados salvos.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // tese trazida do onboarding (handoff só-frontend via localStorage): pré-
      // preenche o compositor já na chegada, antes mesmo do banco responder.
      const pending = takePendingThesis();
      if (pending && !cancelled) {
        setThesisBuild(pending.build);
        setThesisFor(pending.forWhom);
      }
      const RETRY_DELAYS = [600, 1500, 3000]; // ms; cobre o tempo de acordar o banco
      for (let attempt = 0; ; attempt++) {
        try {
          const [loadedTopics, loadedIdeas, latestVerdict] = await Promise.all([
            fetchTopics(),
            fetchIdeas(),
            fetchLatestVerdict(),
          ]);
          if (cancelled) return;
          setTopics(loadedTopics);
          setIdeas(loadedIdeas);
          setError(null);
          if (pending) {
            // recém-saído do onboarding: GERA o primeiro veredito REAL da tese na
            // chegada, com os setores recém-carregados. Fecha o loop tese→veredito,
            // agora com LLM de verdade (o loader aparece durante a geração). Tem
            // prioridade sobre um veredito salvo: a tese que o founder acabou de
            // escrever ganha. Erro aqui não trava — deixa o compositor pré-preenchido.
            setLoading(true);
            try {
              const sectors = loadedTopics.slice(0, MAX_TOPICS).map((t) => t.name);
              const v = await requestVerdict(pending.build, pending.forWhom, sectors, days);
              if (cancelled) return;
              setVerdict(v);
              setGraph(buildGraph(verdictToScan(v), v.sectors));
              setLastUpdated(new Date().toISOString());
              setView("veredito");
            } catch (err) {
              if (cancelled) return;
              setError(err instanceof Error ? err.message : "Não consegui gerar o veredito.");
            } finally {
              if (!cancelled) setLoading(false);
            }
          } else if (latestVerdict) {
            // sem tese nova: restaura o último veredito do workspace e sua evidência.
            setVerdict(latestVerdict);
            setGraph(buildGraph(verdictToScan(latestVerdict), latestVerdict.sectors));
            setLastUpdated(new Date().toISOString());
            setView("veredito");
          }
          return;
        } catch (err) {
          console.error(err);
          if (cancelled) return;
          if (attempt < RETRY_DELAYS.length) {
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
            if (cancelled) return;
            continue;
          }
          setError("Instabilidade ao conectar. Tente adicionar um tema ou recarregar em instantes.");
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // roda uma vez na montagem: usa o `days` inicial só para a geração de
    // chegada (tese vinda do onboarding). Não deve re-rodar — nem regenerar o
    // veredito — quando o usuário muda a janela de tempo depois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // "Gerar veredito": chama o backend real (Coletor com busca web + Parecerista)
  // via requestVerdict, com os setores como input primário e a tese opcional.
  // Deriva a evidência: as fontes do veredito viram as notícias e insights do
  // MESMO grafo do radar, então "ver a evidência no grafo" mostra a prova por
  // trás do parecer. Erro do LLM/rota fica VISÍVEL (CLAUDE.md), não em silêncio.
  async function scan() {
    if (loading) return;
    setLoading(true);
    setError(null);
    bannerTimers.current.forEach(clearTimeout);
    bannerTimers.current = [];
    setBanner(null);
    try {
      const sectors = topics.slice(0, MAX_TOPICS).map((t) => t.name);
      const v = await requestVerdict(thesisBuild, thesisFor, sectors, days);
      setVerdict(v);
      setGraph(buildGraph(verdictToScan(v), v.sectors));
      setLastUpdated(new Date().toISOString());
      setView("veredito");
      const text = "Veredito pronto — a evidência está no grafo";
      bannerTimers.current.push(setTimeout(() => setBanner(text), 300));
      bannerTimers.current.push(setTimeout(() => setBanner(null), 5000));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui gerar o veredito.");
    } finally {
      setLoading(false);
    }
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

  // gera o mergulho (ou recupera do cache no servidor) e abre a tela
  async function dive(id: string) {
    if (divingId) return;
    setDivingId(id);
    try {
      const updated = await requestDeepDive(id);
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setOpenDiveId(id);
    } catch (err) {
      flashMessage(err instanceof Error ? err.message : "Não consegui aprofundar a ideia.");
    } finally {
      setDivingId(null);
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
        <ThesisPanel
          thesisBuild={thesisBuild}
          thesisFor={thesisFor}
          onThesisBuildChange={setThesisBuild}
          onThesisForChange={setThesisFor}
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
          showGraphControls={view === "rede"}
        />
        <div className="panel center-panel" style={{ padding: 0 }}>
          {/* As três views do veredito (Veredito/Evidência/Brief) só fazem
              sentido depois que há veredito — antes disso seriam abas vazias
              competindo com o chamado pra escrever a tese (comportamento do
              item 2, mantido). Já "Na gringa" é um eixo à parte: um feed sempre
              navegável, então fica numa pílula própria, separada à direita e
              presente mesmo antes do veredito. Como o compositor da tese vive
              na coluna esquerda o tempo todo, voltar ao chamado é sempre
              possível; a pílula ainda alterna de volta pro veredito ao ser
              reclicada. */}
          <div className="view-toggle" role="tablist" aria-label="Modo de visualização">
            {verdict && (
              <>
                <button
                  role="tab"
                  aria-selected={view === "rede"}
                  className={`view-tab${view === "rede" ? " active" : ""}`}
                  onClick={() => setView("rede")}
                >
                  Evidência
                </button>
                <button
                  role="tab"
                  aria-selected={view === "brief"}
                  className={`view-tab${view === "brief" ? " active" : ""}`}
                  onClick={() => setView("brief")}
                >
                  Brief
                </button>
                <button
                  role="tab"
                  aria-selected={view === "veredito"}
                  className={`view-tab${view === "veredito" ? " active" : ""}`}
                  onClick={() => setView("veredito")}
                >
                  Veredito
                </button>
              </>
            )}
            <button
              role="tab"
              aria-selected={view === "gringa"}
              className={`view-tab gringa-tab${view === "gringa" ? " active" : ""}`}
              onClick={() => setView(view === "gringa" ? "veredito" : "gringa")}
              title="O que já se move lá fora antes de virar assunto no Brasil"
            >
              <span aria-hidden="true">🌐</span> Na gringa
            </button>
          </div>
          <div className="center-body">
            {view === "gringa" ? (
              <GringaFeed />
            ) : view === "veredito" ? (
              verdict ? (
                <VerdictView verdict={verdict} onSeeEvidence={() => setView("rede")} isExample={false} />
              ) : loading ? (
                <div className="brief-empty">Cruzando as fontes atrás do veredito…</div>
              ) : (
                <div className="center-cta">
                  <span className="center-cta-arrow" aria-hidden="true">
                    ←
                  </span>
                  <h2 className="center-cta-title">Comece pelos setores</h2>
                  <p className="center-cta-text">
                    Escolha ao lado os setores que você quer cruzar (e, se quiser, descreva sua
                    tese), depois clique em <strong>Gerar veredito</strong>. Você recebe um parecer
                    de uma página: quem já faz, o que mudou, o gap, o que mata a ideia e um go /
                    no-go / pivot.
                  </p>
                </div>
              )
            ) : view === "rede" ? (
              <div className="graph-wrap">
                <GraphCanvas
                  graph={graph}
                  onSelect={handleSelect}
                  highlightId={highlightedIdeaId}
                  settings={settings}
                />
                {graph.nodes.length === 0 && !loading && (
                  <div className="empty-state">
                    Esta é a evidência por trás do veredito.
                    <br />
                    Gere um veredito a partir da sua tese e as fontes aparecem aqui como grafo
                    navegável.
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
        <DeepDiveView idea={openDiveIdea} onClose={() => setOpenDiveId(null)} />
      )}
      <Toast message={toast?.message ?? null} action={toast?.action} />
    </div>
  );
}
