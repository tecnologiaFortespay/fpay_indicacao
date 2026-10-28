import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, dateToCompetency, formatDateTime } from "@/lib/competency";
import { getBatch } from "@/lib/imports/queries";
import { importOutcomeLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Importação" };

type PageProps = { params: Promise<{ id: string }> };

export default async function ImportDetailPage({ params }: PageProps) {
  await requireRole("director", "analyst");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    redirect("/importacoes");
  }
  const result = await getBatch(id);
  if (!result) {
    notFound();
  }
  const { batch, rows } = result;
  const months = batch.competencies
    .map((date) => competencyLabel(dateToCompetency(date)))
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
      <section className="fp-panel">
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
