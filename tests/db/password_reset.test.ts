import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { adminClient, createUser, done, ok, PASSWORD, userClient, type Client } from "./helpers";

let admin: Client;
let director: Client;
let noProfile: Client;
let partnerUser: { id: string; email: string };
// Sessão do parceiro aberta antes de a senha dele mudar nos testes.
let partner: Client;

function anonClient(): Client {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function signIn(email: string, password: string) {
  return anonClient().auth.signInWithPassword({ email, password });
}

function secret(): string {
  return randomBytes(32).toString("base64url");
}

beforeAll(async () => {
  admin = adminClient();
  director = await userClient((await createUser(admin, "director")).email);
  noProfile = await userClient((await createUser(admin, null)).email);
  const created = ok(
    await admin
      .from("partners")
      .insert({ name: `Unidade Senha ${Date.now()}`, kind: "unit", status: "active" })
      .select("id")
      .single(),
    "partner",
  );
  partnerUser = await createUser(admin, "partner", created.id);
  partner = await userClient(partnerUser.email);
});

describe("link de nova senha gerado pelo diretor", () => {
  it("só o diretor gera o link", async () => {
    for (const client of [noProfile, partner]) {
      const denied = await client.rpc("create_password_reset", {
        target: partnerUser.id,
        secret: secret(),
      });
      expect(denied.error?.code).toBe("42501");
    }
  });

  it("o parceiro troca a senha pelo link, uma única vez", async () => {
    const link = secret();
    ok(
      await director.rpc("create_password_reset", { target: partnerUser.id, secret: link }),
      "create_password_reset",
    );
    const preview = ok(
      await anonClient().rpc("password_reset_preview", { secret: link }),
      "password_reset_preview",
    );
    expect(preview).toMatchObject({ email: partnerUser.email, display_name: "Teste partner" });

    const short = await anonClient().rpc("reset_password_with_token", {
      secret: link,
      password: "curta",
    });
    expect(short.error?.details).toBe("A senha precisa ter de 8 a 128 caracteres.");

    done(
      await anonClient().rpc("reset_password_with_token", {
        secret: link,
        password: "Senha-nova-pelo-link-1",
      }),
      "reset_password_with_token",
    );
    expect((await signIn(partnerUser.email, "Senha-nova-pelo-link-1")).error).toBeNull();
    expect((await signIn(partnerUser.email, PASSWORD)).error).not.toBeNull();

    const again = await anonClient().rpc("reset_password_with_token", {
      secret: link,
      password: "Outra-senha-123",
    });
    expect(again.error?.message).toBe("RESET_INVALID");
    expect((await anonClient().rpc("password_reset_preview", { secret: link })).data).toBeNull();
  });

  it("link novo invalida o anterior, e link vencido não vale", async () => {
    const first = secret();
    const second = secret();
    ok(
      await director.rpc("create_password_reset", { target: partnerUser.id, secret: first }),
      "first link",
    );
    ok(
      await director.rpc("create_password_reset", { target: partnerUser.id, secret: second }),
      "second link",
    );
    const old = await anonClient().rpc("reset_password_with_token", {
      secret: first,
      password: "Senha-qualquer-1",
    });
    expect(old.error?.message).toBe("RESET_INVALID");

    done(
      await admin
        .from("profiles")
        .update({ password_reset_expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("user_id", partnerUser.id),
      "expire link",
    );
    const expired = await anonClient().rpc("reset_password_with_token", {
      secret: second,
      password: "Senha-qualquer-1",
    });
    expect(expired.error?.message).toBe("RESET_INVALID");
  });
});

// 16/11/2026 — decisão 26: "Esqueci minha senha" envia o link por e-mail. O servidor da aplicação
// gera o link com a chave de serviço; do navegador (sem sessão ou com ela) a função não existe.
describe("link de nova senha pedido pelo e-mail", () => {
  async function expireIn(userId: string, hours: number) {
    done(
      await admin
        .from("profiles")
        .update({
          password_reset_expires_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
        })
        .eq("user_id", userId),
      "age link",
    );
  }

  it("só a chave de serviço pede o link: navegador, parceiro e diretor são recusados", async () => {
    for (const client of [anonClient(), noProfile, director, partner]) {
      const denied = await client.rpc("request_password_reset", {
        account_email: partnerUser.email,
        secret: secret(),
      });
      expect(denied.error?.code).toBe("42501");
      const cancel = await client.rpc("cancel_password_reset", { secret: secret() });
      expect(cancel.error?.code).toBe("42501");
    }
  });

  it("e-mail com cadastro recebe o link (sem diferenciar maiúsculas); e-mail desconhecido não", async () => {
    await expireIn(partnerUser.id, 1);
    const link = secret();
    const account = ok(
      await admin.rpc("request_password_reset", {
        account_email: `  ${partnerUser.email.toUpperCase()} `,
        secret: link,
      }),
      "request_password_reset",
    );
    expect(account).toEqual({ display_name: "Teste partner", email: partnerUser.email });
    const preview = ok(
      await anonClient().rpc("password_reset_preview", { secret: link }),
      "password_reset_preview",
    );
    expect(preview).toMatchObject({ email: partnerUser.email });

    const unknown = await admin.rpc("request_password_reset", {
      account_email: "ninguem@test.local",
      secret: secret(),
    });
    expect(unknown.error).toBeNull();
    expect(unknown.data).toBeNull();
    // Conta sem cadastro na plataforma (sem perfil) também não recebe.
    const orphan = await createUser(admin, null);
    const withoutProfile = await admin.rpc("request_password_reset", {
      account_email: orphan.email,
      secret: secret(),
    });
    expect(withoutProfile.data).toBeNull();
    const badSecret = await admin.rpc("request_password_reset", {
      account_email: partnerUser.email,
      secret: "curto",
    });
    expect(badSecret.error?.message).toBe("RESET_FIELDS");
  });

  it("um pedido a cada 2 minutos por conta; o link anterior continua valendo no intervalo", async () => {
    await expireIn(partnerUser.id, 1);
    const first = secret();
    ok(
      await admin.rpc("request_password_reset", {
        account_email: partnerUser.email,
        secret: first,
      }),
      "first request",
    );
    const second = secret();
    const tooSoon = await admin.rpc("request_password_reset", {
      account_email: partnerUser.email,
      secret: second,
    });
    expect(tooSoon.data).toBeNull();
    expect((await anonClient().rpc("password_reset_preview", { secret: second })).data).toBeNull();
    expect(
      (await anonClient().rpc("password_reset_preview", { secret: first })).data,
    ).not.toBeNull();

    // Três minutos depois (validade recuada no banco para o teste) o pedido novo substitui o link.
    await expireIn(partnerUser.id, 24 - 3 / 60);
    ok(
      await admin.rpc("request_password_reset", {
        account_email: partnerUser.email,
        secret: second,
      }),
      "second request",
    );
    expect((await anonClient().rpc("password_reset_preview", { secret: first })).data).toBeNull();
    done(
      await anonClient().rpc("reset_password_with_token", {
        secret: second,
        password: "Senha-pelo-email-1",
      }),
      "reset_password_with_token",
    );
    expect((await signIn(partnerUser.email, "Senha-pelo-email-1")).error).toBeNull();
  });

  it("e-mail que não saiu desfaz o link, e a pessoa pode pedir de novo na hora", async () => {
    await expireIn(partnerUser.id, 1);
    const failed = secret();
    ok(
      await admin.rpc("request_password_reset", {
        account_email: partnerUser.email,
        secret: failed,
      }),
      "request",
    );
    done(await admin.rpc("cancel_password_reset", { secret: failed }), "cancel_password_reset");
    expect((await anonClient().rpc("password_reset_preview", { secret: failed })).data).toBeNull();
    const retry = ok(
      await admin.rpc("request_password_reset", {
        account_email: partnerUser.email,
        secret: secret(),
      }),
      "retry",
    );
    expect(retry).toMatchObject({ email: partnerUser.email });
  });
});

// 09/11/2026 — Minha conta: quem está conectado troca a própria senha informando a atual.
describe("troca da própria senha", () => {
  it("exige a senha atual, 8 a 128 caracteres e uma senha diferente; depois só a nova entra", async () => {
    const user = await createUser(admin, "director");
    const client = await userClient(user.email);
    const wrong = await client.rpc("change_my_password", {
      current_password: "errada-123",
      new_password: "Senha-nova-conta-1",
    });
    expect(wrong.error?.details).toBe("A senha atual não confere.");
    const short = await client.rpc("change_my_password", {
      current_password: PASSWORD,
      new_password: "curta",
    });
    expect(short.error?.details).toBe("A senha nova precisa ter de 8 a 128 caracteres.");
    const same = await client.rpc("change_my_password", {
      current_password: PASSWORD,
      new_password: PASSWORD,
    });
    expect(same.error?.details).toBe("A senha nova precisa ser diferente da atual.");
    done(
      await client.rpc("change_my_password", {
        current_password: PASSWORD,
        new_password: "Senha-nova-conta-1",
      }),
      "change_my_password",
    );
    expect((await signIn(user.email, "Senha-nova-conta-1")).error).toBeNull();
    expect((await signIn(user.email, PASSWORD)).error).not.toBeNull();
  });

  it("sem sessão não há troca de senha", async () => {
    const denied = await anonClient().rpc("change_my_password", {
      current_password: PASSWORD,
      new_password: "Senha-nova-conta-1",
    });
    expect(denied.error?.code).toBe("42501");
  });

  it("o link de nova senha também serve para um diretor (Equipe)", async () => {
    const other = await createUser(admin, "director");
    const link = secret();
    ok(
      await director.rpc("create_password_reset", { target: other.id, secret: link }),
      "create_password_reset for director",
    );
    const preview = ok(
      await anonClient().rpc("password_reset_preview", { secret: link }),
      "password_reset_preview",
    );
    expect(preview).toMatchObject({ email: other.email, display_name: "Teste director" });
    done(
      await anonClient().rpc("reset_password_with_token", {
        secret: link,
        password: "Senha-diretor-link-1",
      }),
      "reset_password_with_token",
    );
    expect((await signIn(other.email, "Senha-diretor-link-1")).error).toBeNull();
  });
});
