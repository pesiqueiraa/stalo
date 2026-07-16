import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { postAuthDest } from "@/lib/postAuthDest";

// Retorno do OAuth (Google): o Supabase manda o visitante de volta pra cá com um
// ?code. Trocamos o code por sessão e decidimos pra onde ir — quem ainda não tem
// setores nem lente vai pro onboarding; os demais, direto pro radar.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  return NextResponse.redirect(`${origin}${await postAuthDest()}`);
}
