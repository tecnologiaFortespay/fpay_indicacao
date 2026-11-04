import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { adminClient, createUser, done, ok, PASSWORD, userClient, type Client } from "./helpers";

let admin: Client;
let director: Client;
let analyst: Client;
let partnerUser: { id: string; email: string };

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
  analyst = await userClient((await createUser(admin, "analyst")).email);
  const partner = ok(
    await admin
      .from("partners")
      .insert({ name: `Unidade Senha ${Date.now()}`, kind: "unit", status: "active" })
      .select("id")
      .single(),
    "partner",
  );
  partnerUser = await createUser(admin, "partner", partner.id);
});

describe("link de nova senha gerado pelo diretor", () => {
  it("só o diretor gera o link", async () => {
    for (const client of [analyst, await userClient(partnerUser.email)]) {
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
