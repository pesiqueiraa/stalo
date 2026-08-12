import Landing from "./Landing";

// Landing pública. Sem login: o CTA leva direto ao radar — que decide, no
// navegador, se redireciona para o onboarding (o dado que definia esse
// destino saiu do banco pro localStorage, e o servidor não enxerga mais).
export default function Page() {
  return <Landing />;
}
