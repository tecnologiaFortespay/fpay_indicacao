"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { databaseError } from "@/lib/actions";
import { actionUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import { CsvFormatError, parseBiCsv, type ParsedImport } from "@/lib/imports/csv";
import { decodeCsv, validateImportFile } from "@/lib/imports/file";
import { createClient } from "@/lib/supabase/server";

export async function uploadImport(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director", "analyst");
  if (!user) {
    return { error: "Você não tem permissão para importar." };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: "Selecione o arquivo CSV." };
  }
  try {
    validateImportFile(file.name, file.type, file.size);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível ler o arquivo." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const content = decodeCsv(bytes);
  let parsed: ParsedImport;
  try {
    parsed = parseBiCsv(content);
  } catch (error) {
    if (error instanceof CsvFormatError) {
      return { error: error.message };
    }
    throw error;
  }
  if (parsed.rows.length === 0) {
    return { error: "Nenhuma linha válida no arquivo. Confira CNPJ, mês e vidas de cada linha." };
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const supabase = await createClient();
  const result = await supabase.rpc("import_lives", {
    batch: {
      file_name: file.name,
      file_hash: hash,
      rows_read: parsed.rows_read,
      issues: parsed.issues,
    },
    rows: parsed.rows,
  });
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  revalidatePath("/importacoes");
  revalidatePath("/inicio");
  return { success: "Arquivo importado.", destination: `/importacoes/${result.data}` };
}
