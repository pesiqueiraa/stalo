"use client";

import * as d3 from "d3";
import { useEffect, useRef } from "react";
import type { Graph, GraphNode, InsightNode } from "@stalo/shared";
import { diamondPath, innerGlyphPath } from "@/lib/shapes";
import { DEFAULT_SETTINGS, type GraphSettings } from "@/lib/settings";

type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & { kind: "entity" | "insight" };
type NodeSelection = d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>;
type LinkSelection = d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;

interface GraphCanvasProps {
  graph: Graph;
  onSelect: (node: GraphNode) => void;
  highlightId?: string | null;
  settings?: GraphSettings;
}

const ZOOM_EXTENT: [number, number] = [0.3, 3];
const REVEAL_STAGGER_MS = 70;
const REVEAL_DURATION_MS = 350;
// bases da física do grafo — escaladas pelo "espaçamento" (settings.spread)
const BASE_LINK_DISTANCE = 95;
const BASE_CHARGE = -210;

interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function GraphCanvas({
  graph,
  onSelect,
  highlightId = null,
  settings = DEFAULT_SETTINGS,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const zoomApiRef = useRef<{
    zoomBy: (factor: number) => void;
    zoomToFit: () => void;
    panToNode: (id: string) => void;
    resize: () => void;
  } | null>(null);
  const nodeSelRef = useRef<NodeSelection | null>(null);
  const linkSelRef = useRef<LinkSelection | null>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  // settings sempre atual para o draw() (que só roda em [graph]) ler o spread na criação
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let simulation: d3.Simulation<SimNode, SimLink> | null = null;

    function draw() {
      if (!container) return;
      container.innerHTML = "";
      if (simulation) simulation.stop();
      zoomApiRef.current = null;
      nodeSelRef.current = null;
      linkSelRef.current = null;
      if (!graph.nodes.length) return;

      // mutáveis: o resize (recolher painel / redimensionar janela) atualiza sem
      // reconstruir a simulação, então zoomToFit/forças usam sempre o tamanho atual
      let width = container.clientWidth || 600;
      let height = container.clientHeight || 420;
      const svg = d3
        .select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

      const zoomLayer = svg.append("g");

      const rings = zoomLayer
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);
      [1, 2, 3].forEach((i) => {
        rings
          .append("circle")
          .attr("r", (i * Math.min(width, height)) / 7)
          .attr("fill", "none")
          .attr("stroke", "rgba(255,255,255,0.05)");
      });

      const nodes: SimNode[] = graph.nodes.map((d) => ({ ...d }));
      const links: SimLink[] = graph.links.map((d) => ({ ...d }));

      // ordem de entrada na animação: notícias primeiro, insights (tendência/
      // gap/oportunidade) sempre por último, reforçando a leitura de "primeiro
      // acha as notícias, depois sintetiza a conexão"
      const revealIndex = new Map<string, number>();
      [...nodes.filter((n) => n.kind === "news"), ...nodes.filter((n) => n.kind === "insight")].forEach(
        (n, i) => revealIndex.set(n.id, i),
      );
      const revealDelay = (id: string) => (revealIndex.get(id) ?? 0) * REVEAL_STAGGER_MS;

      const spread = settingsRef.current.spread ?? 1;
      simulation = d3
        .forceSimulation<SimNode>(nodes)
        .force(
          "link",
          d3
            .forceLink<SimNode, SimLink>(links)
            .id((d) => d.id)
            .distance(BASE_LINK_DISTANCE * spread)
            .strength(0.4),
        )
        .force("charge", d3.forceManyBody().strength(BASE_CHARGE * spread))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(0.03))
        .force("y", d3.forceY(height / 2).strength(0.03))
        .force(
          "collide",
          d3.forceCollide<SimNode>().radius((d) => d.r + 24),
        );
      simulationRef.current = simulation;

      const linkSel = zoomLayer
        .append("g")
        .selectAll<SVGLineElement, SimLink>("line")
        .data(links)
        .join("line")
        .attr("class", (d) => `link link-${d.kind}`)
        .attr("stroke", (d) =>
          d.kind === "insight" ? "rgba(232,162,61,0.55)" : "rgba(255,255,255,0.15)",
        )
        .attr("stroke-width", (d) => (d.kind === "insight" ? 1.25 : 1))
        .attr("stroke-dasharray", (d) => (d.kind === "insight" ? "4,3" : null));
      linkSelRef.current = linkSel;

      // link só aparece depois que os dois nós que ele conecta já apareceram
      linkSel
        .style("opacity", 0)
        .transition()
        .delay(
          (d) =>
            Math.max(
              revealDelay((d.source as SimNode).id),
              revealDelay((d.target as SimNode).id),
            ) +
            REVEAL_STAGGER_MS / 2,
        )
        .duration(REVEAL_DURATION_MS)
        .style("opacity", 1)
        .on("end", function () {
          d3.select(this).style("opacity", null);
        });

      const dragBehavior = d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation!.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation!.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });

      const nodeSel = zoomLayer
        .append("g")
        .selectAll<SVGGElement, SimNode>("g")
        .data(nodes)
        .join("g")
        .attr("class", (d) => "node node-" + d.kind)
        .call(dragBehavior)
        .on("click", (_event, d) => onSelectRef.current(d));
      nodeSelRef.current = nodeSel;

      // tooltip nativo com o título completo, já que o rótulo abaixo é truncado
      nodeSel.append("title").text((d) => d.title);

      // expõe a cor do insight como var CSS no grupo, pra o glow neon (drop-shadow
      // no globals.css) usar a cor do próprio tipo
      nodeSel
        .filter((d) => d.kind === "insight")
        .style("--glow", (d) => d.color);

      nodeSel
        .filter((d) => d.kind === "news")
        .append("circle")
        .attr("class", "node-main-circle")
        .attr("r", (d) => d.r)
        .attr("fill", (d) => d.color)
        .attr("fill-opacity", 0.8)
        .attr("stroke", "rgba(255,255,255,0.35)")
        .attr("stroke-width", 1);

      // losango VAZADO: contorno na cor neon do tipo, miolo quase transparente
      // (fica clicável em toda a área, mas lê como oco pra receber o glifo central)
      const insightShape = nodeSel
        .filter((d) => d.kind === "insight")
        .append("path")
        .attr("class", "node-main-shape")
        .attr("d", (d) => diamondPath(d.r))
        .attr("fill", (d) => d.color)
        .attr("fill-opacity", 0.12)
        .attr("stroke", (d) => d.color)
        .attr("stroke-width", 2.25);

      // glifo central que identifica o tipo: losango (gap), triângulo (tendência),
      // estrela (oportunidade)
      const insightGlyph = nodeSel
        .filter((d) => d.kind === "insight")
        .append("path")
        .attr("class", "node-glyph")
        .attr("d", (d) => innerGlyphPath((d as InsightNode).insightType, d.r))
        .attr("fill", (d) => d.color)
        .attr("fill-opacity", 0.95);

      nodeSel
        .filter((d) => d.kind === "news")
        .append("text")
        .text((d) => (d.title.length > 24 ? d.title.slice(0, 22) + "…" : d.title))
        .attr("x", (d) => d.r + 6)
        .attr("y", 4)
        .attr("font-size", 10.5)
        .attr("fill", "var(--text-dim)");

      nodeSel
        .style("opacity", 0)
        .transition()
        .delay((d) => revealDelay(d.id))
        .duration(REVEAL_DURATION_MS)
        .style("opacity", 1)
        .on("end", function () {
          d3.select(this).style("opacity", null);
        });

      // ápice da revelação: os insights (que entram por último) "estouram" com
      // overshoot e disparam um ping de radar expandindo — o momento da síntese.
      // Respeita prefers-reduced-motion: aí ficam só no fade acima.
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (!reduceMotion) {
        // scale com overshoot no losango + glifo (a origem 0,0 é o centro do nó,
        // então a escala não desloca a posição)
        [insightShape, insightGlyph].forEach((sel) => {
          sel
            .attr("transform", "scale(0.1)")
            .transition()
            .delay((d) => revealDelay(d.id))
            .duration(520)
            .ease(d3.easeBackOut.overshoot(1.7))
            .attr("transform", "scale(1)")
            .on("end", function () {
              d3.select(this).attr("transform", null);
            });
        });

        // ping: um anel na cor do tipo que aparece e expande pra fora, uma vez
        nodeSel
          .filter((d) => d.kind === "insight")
          .append("circle")
          .attr("class", "reveal-ping")
          .attr("r", (d) => d.r)
          .attr("fill", "none")
          .attr("stroke", (d) => d.color)
          .attr("stroke-width", 1.5)
          .style("opacity", 0)
          .transition()
          .delay((d) => revealDelay(d.id) + 80)
          .duration(1)
          .style("opacity", 0.7)
          .transition()
          .duration(680)
          .ease(d3.easeCubicOut)
          .attr("r", (d) => d.r + 30)
          .style("opacity", 0)
          .on("end", function () {
            d3.select(this).remove();
          });
      }

      // true quando o usuário mexeu no zoom/pan à mão — nesse caso o resize não
      // re-encaixa, pra não roubar a visão que ele escolheu
      let userZoomed = false;
      const zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent(ZOOM_EXTENT)
        .filter((event) => !event.target.closest?.(".node"))
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform.toString());
          // sourceEvent presente = interação humana (roda/arrasto); fit/pan
          // programáticos não têm sourceEvent
          if (event.sourceEvent) userZoomed = true;
        });

      svg.call(zoomBehavior);

      function zoomToFit(animate: boolean) {
        userZoomed = false; // encaixar é reset da visão — volta a acompanhar o resize
        const padding = 60;
        const xs = nodes.map((n) => n.x ?? width / 2);
        const ys = nodes.map((n) => n.y ?? height / 2);
        const minX = Math.min(...xs) - padding;
        const maxX = Math.max(...xs) + padding;
        const minY = Math.min(...ys) - padding;
        const maxY = Math.max(...ys) + padding;
        const boxWidth = Math.max(maxX - minX, 1);
        const boxHeight = Math.max(maxY - minY, 1);
        const scale = Math.min(
          ZOOM_EXTENT[1],
          Math.max(ZOOM_EXTENT[0], Math.min(width / boxWidth, height / boxHeight)),
        );
        const tx = width / 2 - scale * (minX + boxWidth / 2);
        const ty = height / 2 - scale * (minY + boxHeight / 2);
        const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        const target = animate ? svg.transition().duration(400) : svg;
        target.call(zoomBehavior.transform, transform);
      }

      zoomApiRef.current = {
        zoomBy: (factor) => {
          svg.transition().duration(200).call(zoomBehavior.scaleBy, factor);
        },
        zoomToFit: () => zoomToFit(true),
        panToNode: (id) => {
          const target = nodes.find((n) => n.id === id);
          if (!target) return;
          const currentScale = d3.zoomTransform(svg.node()!).k;
          const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(currentScale)
            .translate(-(target.x ?? width / 2), -(target.y ?? height / 2));
          svg.transition().duration(400).call(zoomBehavior.transform, transform);
        },
        // ajusta só o tamanho do SVG e re-centra anéis/forças, SEM reconstruir a
        // simulação nem mexer no zoom/pan — as posições dos nós ficam intactas.
        // As forças só são reaplicadas num próximo drag (a sim está assentada), então
        // nada se reorganiza ao recolher/reabrir o painel.
        resize: () => {
          if (!container) return;
          width = container.clientWidth || width;
          height = container.clientHeight || height;
          svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
          rings.attr("transform", `translate(${width / 2},${height / 2})`);
          simulation
            ?.force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.03))
            .force("y", d3.forceY(height / 2).strength(0.03));
          // re-encaixa na nova área (mantém centralizado no reload / ao recolher o
          // painel) — só não mexe se o usuário ajustou o zoom/pan à mão. Não
          // re-simula: as posições dos nós ficam intactas, muda só a câmera.
          if (!userZoomed) zoomToFit(true);
        },
      };

      // esconde rótulos de notícia que se sobrepõem (mantém o primeiro em
      // ordem de dados). Roda em coords locais, antes do zoom, então o
      // resultado é invariante ao nível de zoom. O título completo continua
      // acessível via tooltip nativo (<title>) mesmo com o rótulo escondido.
      const FONT_SIZE = 10.5;
      const LABEL_PAD = 2;
      function resolveLabelCollisions() {
        // começa com os losangos de insight como zonas ocupadas: eles são os
        // pontos focais (e não têm rótulo próprio), então um título de notícia
        // rabiscado por cima deles é o pior caso — melhor esconder o rótulo
        const placed: LabelBox[] = nodes
          .filter((n) => n.kind === "insight")
          .map((n) => ({
            x0: (n.x ?? 0) - n.r,
            y0: (n.y ?? 0) - n.r,
            x1: (n.x ?? 0) + n.r,
            y1: (n.y ?? 0) + n.r,
          }));
        nodeSel
          .filter((d) => d.kind === "news")
          .each(function (d) {
            const textEl = d3.select<SVGGElement, SimNode>(this).select<SVGTextElement>("text");
            const node = textEl.node();
            if (!node) return;
            const w = node.getComputedTextLength();
            const x0 = (d.x ?? 0) + d.r + 6 - LABEL_PAD;
            const y0 = (d.y ?? 0) + 4 - FONT_SIZE;
            const box: LabelBox = { x0, y0, x1: x0 + w + LABEL_PAD * 2, y1: y0 + FONT_SIZE + LABEL_PAD };
            if (placed.some((p) => boxesOverlap(p, box))) {
              textEl.style("display", "none");
            } else {
              textEl.style("display", null);
              placed.push(box);
            }
          });
      }

      simulation.on("tick", () => {
        linkSel
          .attr("x1", (d) => (d.source as SimNode).x ?? 0)
          .attr("y1", (d) => (d.source as SimNode).y ?? 0)
          .attr("x2", (d) => (d.target as SimNode).x ?? 0)
          .attr("y2", (d) => (d.target as SimNode).y ?? 0);
        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });

      // recomputa quando a simulação assenta — inclusive depois de arrastar
      // um nó (o drag reinicia o sim, que decai e dispara "end" de novo)
      simulation.on("end", () => {
        zoomToFit(true);
        resolveLabelCollisions();
      });
    }

    draw();

    // Ajusta o SVG quando o CONTAINER muda de tamanho — recolher o painel de
    // ideias alarga a coluna do grafo sem disparar resize da janela. Cobre também
    // o resize de janela (o container acompanha), então dispensa listener próprio.
    // É um resize LEVE (só o SVG), não um redraw: a rede não recarrega ao togglar.
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === lastW && h === lastH) return; // ignora o disparo inicial do observer
      lastW = w;
      lastH = h;
      zoomApiRef.current?.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (simulation) simulation.stop();
    };
  }, [graph]);

  // destaca o nó de uma ideia salva (hover no card da sidebar) sem recriar a simulação
  useEffect(() => {
    const nodeSel = nodeSelRef.current;
    const linkSel = linkSelRef.current;
    if (!nodeSel) return;

    // se a ideia em hover não corresponder a nenhum nó do grafo atual (ex:
    // depois de um novo scan), não faz sentido esmaecer tudo sem destacar nada
    const targetExists = highlightId != null && nodeSel.data().some((d) => d.id === highlightId);

    nodeSel
      .classed("node-highlighted", (d) => targetExists && d.id === highlightId)
      .classed("node-dimmed", (d) => targetExists && d.id !== highlightId);

    linkSel?.classed("link-dimmed", (d) => {
      if (!targetExists) return false;
      const source = d.source as SimNode;
      const target = d.target as SimNode;
      return source.id !== highlightId && target.id !== highlightId;
    });

    if (targetExists) {
      nodeSel.filter((d) => d.id === highlightId).raise();
      zoomApiRef.current?.panToNode(highlightId!);
    }
  }, [highlightId]);

  // "espaçamento" (spread): atualiza a repulsão + a distância das ligações na
  // simulação viva e a reaquece, sem recriar o grafo. Pula o primeiro render
  // (o draw já criou com o spread atual), evitando um "pulo" ao montar.
  const spreadMountRef = useRef(true);
  useEffect(() => {
    if (spreadMountRef.current) {
      spreadMountRef.current = false;
      return;
    }
    const sim = simulationRef.current;
    if (!sim) return;
    const spread = settings.spread;
    const link = sim.force("link") as d3.ForceLink<SimNode, SimLink> | undefined;
    const charge = sim.force("charge") as d3.ForceManyBody<SimNode> | undefined;
    link?.distance(BASE_LINK_DISTANCE * spread);
    charge?.strength(BASE_CHARGE * spread);
    sim.alpha(0.4).restart();
  }, [settings.spread]);

  // classes que ligam/desligam elementos por CSS, sem redesenhar o grafo (o
  // draw() só depende de [graph]) — assim togglar um checkbox preserva o layout
  // e o zoom atuais. A resolução de colisão de rótulos guarda o display inline
  // de cada label; quando showLabels volta, o resultado dela é respeitado.
  const graphClass = [
    !settings.showLinks && "hide-links",
    !settings.showEntityLinks && "hide-entity-links",
    !settings.showLabels && "hide-labels",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div id="graph" ref={containerRef} className={graphClass} />
      {graph.nodes.length > 0 && (
        <div className="graph-controls">
          <button title="Aproximar" onClick={() => zoomApiRef.current?.zoomBy(1.4)}>
            +
          </button>
          <button title="Afastar" onClick={() => zoomApiRef.current?.zoomBy(1 / 1.4)}>
            −
          </button>
          <button title="Encaixar tudo na tela" onClick={() => zoomApiRef.current?.zoomToFit()}>
            ⤢
          </button>
        </div>
      )}
    </>
  );
}
