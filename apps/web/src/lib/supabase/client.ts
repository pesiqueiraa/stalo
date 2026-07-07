import { createBrowserClient } from "@supabase/ssr";

// Cliente do Supabase para uso no browser (client components: login/cadastro).
// A anon key é pública por design (protegida por RLS no Supabase).
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
