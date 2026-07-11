// @stalo/server — backend do Stalo: acesso ao banco, persistência e o scan
// (busca + IA). SERVER-ONLY: só deve ser importado por código de servidor
// (as rotas /api/* do apps/web). db.ts tem `import "server-only"` como guarda.
//
// Este index expõe a API pública que as rotas consomem.
export { runScan, runDeepDive, runFinancials, runVerdict, runGringa } from "./scan";
export { isValidScanResult } from "./validate";
export { checkRateLimit, type RateLimitResult } from "./rateLimit";
export { ingest, ingestSectors, parseFeed } from "./rss";
export { weekStart, comboKey, assemble } from "./newsletter";
export { renderBoletim, renderBoasVindas, sampleEdition } from "./render";
export { sendBoletim } from "./send";
export {
  MAX_TOPICS,
  listTopics,
  countTopics,
  addTopic,
  removeTopic,
  saveScan,
  getLatestScan,
  saveVerdict,
  getLatestVerdict,
  listIdeas,
  saveIdea,
  removeIdea,
  getIdea,
  saveDeepDive,
  saveFinancials,
  getLens,
  setLens,
  getGringaFeed,
  saveGringaFeed,
  saveSubscriber,
  getActiveSubscribers,
  unsubscribe,
  getEdition,
  ensureEdition,
  saveCombo,
} from "./repo";
