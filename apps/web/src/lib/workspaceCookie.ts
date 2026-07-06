// Nome do cookie que identifica o workspace anônimo do visitante. Vive num
// módulo neutro (sem "server-only" nem next/headers) para ser importável tanto
// pelo middleware (Edge) quanto pelo helper de servidor.
export const WORKSPACE_COOKIE = "stalo_wid";

// 1 ano — o radar de um visitante persiste enquanto o cookie durar (não sobrevive
// a limpar cookies/trocar de aparelho; isso é o trade-off do workspace anônimo,
// ver produto.md §2). O mesmo id vira o user_id quando contas reais entrarem.
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
