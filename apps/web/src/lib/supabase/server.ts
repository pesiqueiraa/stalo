import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Cliente do Supabase para código de servidor (rotas /api/*, getWorkspaceId).
// Lê/escreve a sessão nos cookies via next/headers. O refresh do token acontece
// no proxy.ts; aqui o setAll pode ser no-op quando chamado de um Server
// Component (contexto read-only).
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // chamado de um Server Component read-only — o proxy cuida do refresh
          }
        },
      },
    },
  );
}
