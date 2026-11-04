"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { databaseError, formValue } from "@/lib/actions";
import { aiConfigured } from "@/lib/ai/claude";
import { livesByCnpj, runImportReview, startReview } from "@/lib/ai/reviews";
import { actionUser, deniedState } from "@/lib/auth/session";
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
    return deniedState("Você não tem permissão para importar.");
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
  // A análise da IA roda nos envios do diretor; compara com as vidas do mês antes deste envio.
  const withAi = user.profile.role === "director" && aiConfigured();
  const livesBefore = withAi ? await livesByCnpj(competency) : null;
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
  if (withAi) {
    const batchId = result.data;
    const reviewId = await startReview({ batch_id: batchId }).catch(() => null);
    if (reviewId) {
      // A planilha inteira só existe agora: vai para a checagem de CNPJ e não é guardada.
      const sheet = parsed.rows.map((row) => ({ cnpj: row.cnpj, company_name: row.company_name }));
      after(() =>
        runImportReview(reviewId, batchId, {
          livesBeforeUpload: livesBefore && livesBefore.size > 0 ? livesBefore : null,
          sheet,
        }),
      );
    }
  }
  return { success: "Arquivo importado.", destination: `/importacoes/${result.data}` };
}

// Análise pedida depois, na página do envio: sem a planilha inteira, não confere CNPJ.
export async function analyzeImport(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState("Só o diretor pede análises da IA.");
  }
  if (!aiConfigured()) {
    return { error: "A IA ainda não está ligada neste servidor." };
  }
  const batchId = formValue(form, "batch_id");
  let reviewId: string;
  try {
    reviewId = await startReview({ batch_id: batchId });
  } catch (error) {
    return { error: databaseError(error as { message: string }) };
  }
  after(() => runImportReview(reviewId, batchId, { livesBeforeUpload: null, sheet: null }));
  redirect(`/importacoes/${batchId}`);
}
