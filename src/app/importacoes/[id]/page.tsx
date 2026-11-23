import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AiReviewPanel } from "@/components/ai-review-panel";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { KeyValueStrip } from "@/components/key-value-strip";
import { MonthCompanies } from "@/components/month-companies";
import { SectionCard } from "@/components/section-card";
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
import { help } from "@/lib/help";
import { importOutcomeLabels } from "@/lib/labels";
import { analyzeImport } from "../actions";

export const metadata: Metadata = { title: "Importação" };

// A análise da IA roda depois da resposta (after()) e pode levar alguns minutos na Vercel.
export const maxDuration = 300;

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> };

export default async function ImportDetailPage({ params, searchParams }: PageProps) {
  await requireRole("director");
  const { id } = await params;
  const { msg } = await searchParams;
  if (!z.uuid().safeParse(id).success) {
    redirect("/importacoes");
  }
  const result = await getBatch(id);
  if (!result) {
    notFound();
  }
  const { batch, rows } = result;
  const review = await latestReview({ batch_id: batch.id });
  const months = batch.competencies
    .map((date) => {
      const competency = dateToCompetency(date);
      const kind = completesMonth(batch.created_at, competency) ? "mês completo" : "parcial";
      return `${competencyLabel(competency)} (${kind})`;
    })
    .join(", ");
  return (
    <AppShell title="Importação" flash={msg}>
      <Link href="/importacoes" className="fp-detail-back">
        ← Importações
      </Link>
      <KeyValueStrip
        facts={[
          ["Arquivo", batch.file_name],
          ["Enviado em", formatDateTime(batch.created_at)],
          ["Por", batch.author],
          ["Mês", months || "—", help.diretor.importacoes.mes],
          [
            "Linhas lidas",
            <span key="read" className="fp-num">
              {batch.rows_read}
            </span>,
            help.diretor.importacoes.linhasLidas,
          ],
          [
            "Importadas",
            <span key="imported" className="fp-num">
              {batch.rows_imported}
            </span>,
            help.diretor.importacoes.importadas,
          ],
          [
            "Fora da plataforma",
            <span key="skipped" className="fp-num">
              {batch.rows_skipped}
            </span>,
            help.diretor.importacoes.foraDaPlataforma,
          ],
          [
            "Ignoradas",
            <span key="ignored" className="fp-num">
              {batch.rows_ignored}
            </span>,
            help.diretor.importacoes.ignoradas,
          ],
        ]}
      />
      <AiReviewPanel
        title="Análise da IA"
        info={help.diretor.importacoes.analiseDaIa}
        description="A IA compara este envio com o anterior do mesmo mês e com o mês passado, aponta quedas, saltos e indicações que sumiram e, no momento do envio, procura no arquivo empresas que podem ser a indicação com o CNPJ digitado errado. Ela não altera nenhum dado."
        review={review}
        configured={aiConfigured()}
        action={analyzeImport}
        fields={{ batch_id: batch.id }}
      />
      {/* Decisão 27: as empresas do mês e a vigência do parceiro aplicada a cada uma. */}
      {batch.competencies.map((date) => (
        <MonthCompanies
          key={date}
          competency={dateToCompetency(date)}
          returnTo={`/importacoes/${batch.id}`}
        />
      ))}
      <SectionCard
        title={`Linhas ignoradas ou mescladas (${rows.length})`}
        info={help.diretor.importacoes.linhasIgnoradas}
        subtitle="Linhas que não entraram como vieram, com o motivo. Empresas sem indicação na plataforma só são contadas."
      >
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma linha ignorada ou mesclada" />
        ) : (
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th className="fp-num">Linha</th>
                  <th>
                    Resultado
                    <InfoTip text={help.diretor.importacoes.resultado} />
                  </th>
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
                    <td className="fp-num break-all">{row.raw_line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AppShell>
  );
}
