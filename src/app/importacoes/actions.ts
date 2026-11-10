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
  completesMonth,
  currentCompetency,
  dateToCompetency,
  isCompetency,
} from "@/lib/competency";
import { BiFormatError, parseBiExport, type ParsedExport } from "@/lib/imports/bi";
import { readImportSheet, validateImportFile } from "@/lib/imports/file";
import { parseDatabasePreview, partnerTotals, type ImportPreview } from "@/lib/imports/preview";
import { WorkbookError } from "@/lib/imports/xlsx";
import { createClient } from "@/lib/supabase/server";

type Upload = {
  competency: string;
  file: File;
  hash: string;
  parsed: ParsedExport;
};

// Lê e confere o formulário de envio (mês e arquivo .csv ou .xlsx do BI). Usado pela conferência
// e pela importação, que leem o mesmo arquivo do mesmo jeito.
async function readUpload(form: FormData): Promise<Upload | { error: string }> {
  const competency = formValue(form, "competency");
  if (!isCompetency(competency)) {
    return { error: "Informe o mês de referência (o mesmo filtrado no BI)." };
  }
  if (competency > currentCompetency()) {
    return { error: "O mês de referência não pode ser um mês futuro." };
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo exportado do BI." };
  }
  try {
    validateImportFile(file.name, file.type, file.size);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível ler o arquivo." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed: ParsedExport;
  try {
    parsed = parseBiExport(readImportSheet(file.name, bytes), competencyToDate(competency));
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
        "Nenhuma linha de empresa válida no arquivo. Confira se é o export “Detalhamento Empresas” do BI.",
    };
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { competency, file, hash, parsed };
}

function batchPayload(upload: Upload) {
  return {
    batch: {
      file_name: upload.file.name,
      file_hash: upload.hash,
      competency: upload.parsed.competency,
      rows_read: upload.parsed.rows_read,
      issues: upload.parsed.issues,
    },
    rows: upload.parsed.rows,
  };
}

export type PreviewState = { error?: string; preview?: ImportPreview };

// Conferência: roda a importação no banco e desfaz (preview_import); nada fica gravado.
export async function previewImport(form: FormData): Promise<PreviewState> {
  const user = await actionUser("director");
  if (!user) {
    return { error: "Você não tem permissão para importar." };
  }
  const upload = await readUpload(form);
  if ("error" in upload) {
    return { error: upload.error };
  }
  const supabase = await createClient();
  const result = await supabase.rpc("preview_import", batchPayload(upload));
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  const preview = parseDatabasePreview(result.data);
  return {
    preview: {
      ...preview,
      partners: partnerTotals(preview.referrals),
      file_name: upload.file.name,
      file_hash: upload.hash,
      competency: upload.competency,
      complete: completesMonth(new Date(), upload.competency),
      rows_read: upload.parsed.rows_read,
    },
  };
}

export async function uploadImport(_previous: FormState, form: FormData): Promise<FormState> {
  const user = await actionUser("director");
  if (!user) {
    return deniedState("Você não tem permissão para importar.");
  }
  const upload = await readUpload(form);
  if ("error" in upload) {
    return { error: upload.error };
  }
  const expectedHash = formValue(form, "expected_hash");
  if (expectedHash && expectedHash !== upload.hash) {
    return {
      error: "O arquivo mudou depois da conferência. Clique em Conferir arquivo de novo.",
    };
  }
  const { competency, parsed } = upload;
  // A análise da IA roda nos envios do diretor; compara com as vidas do mês antes deste envio.
  const withAi = aiConfigured();
  const livesBefore = withAi ? await livesByCnpj(competency) : null;
  const supabase = await createClient();
  const result = await supabase.rpc("import_lives", batchPayload(upload));
  if (result.error) {
    return { error: databaseError(result.error) };
  }
  // Todas as telas que mostram vidas ou a data da base (decisão 21).
  for (const path of ["/importacoes", "/inicio", "/indicacoes", "/fechamento", "/fechamentos"]) {
    revalidatePath(path);
  }
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
