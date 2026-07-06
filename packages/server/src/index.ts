// @stalo/server — backend do Stalo: acesso ao banco, persistência e o scan
// (busca + IA). SERVER-ONLY: só deve ser importado por código de servidor
// (as rotas /api/* do apps/web). db.ts tem `import "server-only"` como guarda.
//
// Este index expõe a API pública que as rotas consomem.
export { runScan, isValidScanResult, runDeepDive, runFinancials } from "./scan";
export {
  MAX_TOPICS,
  listTopics,
  countTopics,
  addTopic,
  removeTopic,
  saveScan,
  getLatestScan,
  listIdeas,
  saveIdea,
  removeIdea,
  getIdea,
  saveDeepDive,
  saveFinancials,
} from "./repo";
