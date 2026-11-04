// Mensagens em português para os códigos de erro do Supabase Auth que uma pessoa pode encontrar.
// Código desconhecido vai para o log do servidor e a tela mostra só o texto genérico.
const authMessages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed:
    "Este e-mail ainda não foi confirmado. Peça à Fortes Pay para liberar o acesso.",
  over_request_rate_limit:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit:
    "Muitos cadastros em pouco tempo. Aguarde uma hora e tente de novo, ou avise a Fortes Pay.",
  weak_password: "Senha fraca: use pelo menos 8 caracteres, misturando letras e números.",
  email_address_invalid: "Este e-mail não é aceito. Confira se está escrito certo.",
  email_address_not_authorized: "Este e-mail não é aceito. Use outro ou avise a Fortes Pay.",
  validation_failed: "Confira o e-mail e a senha informados.",
  user_banned: "Este acesso está bloqueado. Fale com a Fortes Pay.",
  signup_disabled: "Cadastro indisponível no momento. Avise a Fortes Pay.",
};

export function authErrorMessage(
  error: { code?: string; status?: number; message: string },
  fallback: string,
): string {
  const known = error.code ? authMessages[error.code] : undefined;
  if (known) {
    return known;
  }
  console.error("Erro do Supabase Auth:", error.status, error.code, error.message);
  return fallback;
}
