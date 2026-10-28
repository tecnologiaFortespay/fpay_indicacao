"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { databaseError, formValue } from "@/lib/actions";
import { actionUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/validation";
import {
  competencyLabel,
  competencyToDate,
  currentCompetency,
  dateToCompetency,
  isCompetency,
} from "@/lib/competency";
import { BiFormatError, parseBiExport, type ParsedExport } from "@/lib/imports/bi";
import { validateImportFile } from "@/lib/imports/file";
import { readFirstSheet, WorkbookError } from "@/lib/imports/xlsx";
import { createClient } from "@/lib/supabase/server";

export async function uploadImport(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director", "analyst");
  if (!user) {
    return { error: "Você não tem permissão para importar." };
  }
  const competency = formValue(form, "competency");
  if (!isCompetency(competency)) {
    return { error: "Informe o mês de referência (o mesmo filtrado no BI)." };
  }
  if (competency > currentCompetency()) {
    return { error: "O mês de referência não pode ser um mês futuro." };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: "Selecione a planilha exportada do BI." };
  }
  try {
    validateImportFile(file.name, file.type, file.size);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível ler o arquivo." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed: ParsedExport;
  try {
    parsed = parseBiExport(readFirstSheet(bytes), competencyToDate(competency));
  } catch (error) {
    if (error instanceof WorkbookError || error instanceof BiFormatError) {
      return { error: error.message };
    }
    throw error;
  }
  if (parsed.filter_competency && parsed.filter_competency !== parsed.competency) {
    const fileMonth = competencyLabel(dateToCompetency(parsed.filter_competency));
    return {
      error: `O arquivo é de ${fileMonth}, mas o mês escolhido foi ${competencyLabel(competency)}. Confira o filtro do BI e o mês informado.`,
    };
  }
  if (parsed.rows.length === 0) {
    return {
      error:
        "Nenhuma linha de empresa válida na planilha. Confira se é o export “Detalhamento Empresas” do BI.",
    };
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const supabase = await createClient();
  const result = await supabase.rpc("import_lives", {
    batch: {
      file_name: file.name,
      file_hash: hash,
      competency: parsed.competency,
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
