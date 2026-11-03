import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AiReviewPanel } from "@/components/ai-review-panel";
import { AppShell } from "@/components/app-shell";
import { aiConfigured } from "@/lib/ai/claude";
import { latestReview } from "@/lib/ai/reviews";
import { requireRole } from "@/lib/auth/session";
import {
  competencyLabel,
  completesMonth,
  dateToCompetency,
  formatDateTime,
} from "@/lib/competency";
import { getBatch } from "@/lib/imports/queries";
import { importOutcomeLabels } from "@/lib/labels";
import { analyzeImport } from "../actions";

export const metadata: Metadata = { title: "Importação" };

// A análise da IA roda depois da resposta (after()) e pode levar alguns minutos na Vercel.
export const maxDuration = 300;

type PageProps = { params: Promise<{ id: string }> };

export default async function ImportDetailPage({ params }: PageProps) {
  const user = await requireRole("director", "analyst");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    redirect("/importacoes");
  }
  const result = await getBatch(id);
  if (!result) {
    notFound();
  }
  const { batch, rows } = result;
  const director = user.profile.role === "director";
  const review = director ? await latestReview({ batch_id: batch.id }) : null;
  const months = batch.competencies
    .map((date) => {
      const competency = dateToCompetency(date);
      const kind = completesMonth(batch.created_at, competency) ? "mês completo" : "parcial";
      return `${competencyLabel(competency)} (${kind})`;
    })
    .join(", ");
  return (
    <AppShell title="Importação">
      <Link href="/importacoes" className="fp-detail-back">
        ← Importações
      </Link>
      <div className="fp-detail-total">
        <div>
          <span>Arquivo</span>
          <strong className="text-base">{batch.file_name}</strong>
        </div>
        <div>
          <span>Enviado em</span>
          <strong className="text-base">{formatDateTime(batch.created_at)}</strong>
        </div>
        <div>
          <span>Por</span>
          <strong className="text-base">{batch.author}</strong>
        </div>
        <div>
          <span>Mês</span>
          <strong className="text-base">{months || "—"}</strong>
        </div>
        <div>
          <span>Linhas lidas</span>
          <strong className="fp-num">{batch.rows_read}</strong>
        </div>
        <div>
          <span>Importadas</span>
          <strong className="fp-num">{batch.rows_imported}</strong>
        </div>
        <div>
          <span>Fora da plataforma</span>
          <strong className="fp-num">{batch.rows_skipped}</strong>
        </div>
        <div>
          <span>Ignoradas</span>
          <strong className="fp-num">{batch.rows_ignored}</strong>
        </div>
      </div>
      {director && (
        <AiReviewPanel
          title="Análise da IA"
          description="A IA compara este envio com o anterior do mesmo mês e com o mês passado, aponta quedas, saltos e indicações que sumiram e, no momento do envio, procura no arquivo empresas que podem ser a indicação com o CNPJ digitado errado. Ela não altera nenhum dado."
          review={review}
          configured={aiConfigured()}
          action={analyzeImport}
          fields={{ batch_id: batch.id }}
        />
      )}
      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Linhas ignoradas ou mescladas</h2>
          <span>{rows.length} linha(s)</span>
        </div>
        {rows.length === 0 ? (
          <p className="fp-panel-footnote">
            Nenhuma linha ignorada ou mesclada. Empresas sem indicação na plataforma só são
            contadas.
          </p>
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th className="fp-num">Linha</th>
                  <th>Resultado</th>
                  <th>Motivo</th>
                  <th>Conteúdo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="fp-num">{row.line_number}</td>
                    <td>
                      {importOutcomeLabels[row.outcome as keyof typeof importOutcomeLabels] ??
                        row.outcome}
                    </td>
                    <td>{row.reason}</td>
                    <td className="font-mono text-xs break-all">{row.raw_line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
