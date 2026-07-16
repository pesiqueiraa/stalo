import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { postAuthDest } from "@/lib/postAuthDest";

// Link de confirmação de e-mail: o template "Confirm signup" do Supabase aponta
// pra cá com ?token_hash&type. verifyOtp valida o token e cria a sessão — o
// formato token_hash funciona aberto em qualquer navegador (não depende do PKCE
// do browser que iniciou o cadastro). Link expirado/já usado volta pro login
// com aviso visível (?error=confirm), nunca tela de erro crua.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }
  return NextResponse.redirect(`${origin}${await postAuthDest()}`);
}
