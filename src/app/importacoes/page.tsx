import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/fields";
import { Notice } from "@/components/notice";
import { OrbitaIcon } from "@/components/orbita-icon";
import { PageIntro } from "@/components/page-intro";
import { PanelBody, SectionCard } from "@/components/section-card";
import { requireRole } from "@/lib/auth/session";
import {
  competencyLabel,
  completesMonth,
  currentCompetency,
  dateToCompetency,
  formatDateTime,
} from "@/lib/competency";
import { BATCH_PAGE_SIZE, latestImport, listBatches } from "@/lib/imports/queries";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importações" };

// A análise da IA roda depois da resposta (after()) e pode levar alguns minutos na Vercel.
export const maxDuration = 300;

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function ImportsPage({ searchParams }: PageProps) {
  await requireRole("director");
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1));
  const [{ items, total }, last] = await Promise.all([listBatches(page), latestImport()]);
  return (
    <AppShell title="Importações">
      <PageIntro>
        Aqui entra a planilha do BI com as vidas pagas de cada empresa. É ela que alimenta os
        valores dos parceiros e libera o fechamento do mês.
      </PageIntro>

      <Notice tone="info" title="Como funciona">
        <ul>
          <li>
            Envie a planilha <strong>Detalhamento Empresas</strong> exportada do BI com o filtro de
            um mês, do jeito que sai de lá (.csv ou .xlsx, até 4 MB). A coluna{" "}
            <strong>C. Cash-in</strong> é lida como vidas pagas.
          </li>
          <li>
            Antes de gravar, <strong>Conferir arquivo</strong> mostra o que vai mudar: cada
            indicação com as vidas de hoje e as do arquivo, a situação e o valor do mês, por
            parceiro. Só depois de <strong>Confirmar e importar</strong> algo é gravado.
          </li>
          <li>
            Só entram as empresas indicadas na plataforma; as outras são só contadas como “fora da
            plataforma”.
          </li>
          <li>
            O mês em andamento pode ser enviado quantas vezes quiser: cada envio{" "}
            <strong>substitui</strong> as vidas do mês (nunca soma). Esses envios são parciais: não
            marcam ninguém como inadimplente.
          </li>
          <li>
            O envio feito <strong>depois que o mês termina</strong> completa o mês: libera o
            fechamento e marca como Inadimplente a indicação ativa sem vidas.
          </li>
        </ul>
      </Notice>

      <SectionCard
        title="Enviar a planilha do BI"
        subtitle={
          last
            ? `Último envio em ${formatDateTime(last.created_at)} por ${last.author}.`
            : "Nenhum envio ainda."
        }
      >
        <PanelBody>
          <ImportForm defaultMonth={currentCompetency()} />
        </PanelBody>
      </SectionCard>

      <SectionCard
        title={`Envios realizados (${total})`}
        subtitle="Do mais novo para o mais antigo. Abra um envio para ver as linhas ignoradas."
      >
        {items.length === 0 ? (
          <EmptyState title="Nenhum envio registrado" />
        ) : (
          items.map((batch) => (
            <Link className="fp-action-row" key={batch.id} href={`/importacoes/${batch.id}`}>
              <span>
                <strong>{batch.file_name}</strong>
                <small>
                  {formatDateTime(batch.created_at)} · {batch.author} ·{" "}
                  {batch.competencies
                    .map((date) => {
                      const competency = dateToCompetency(date);
                      const kind = completesMonth(batch.created_at, competency)
                        ? "mês completo"
                        : "parcial";
                      return `${competencyLabel(competency)} (${kind})`;
                    })
                    .join(", ") || "sem mês"}{" "}
                  · {batch.rows_imported} importada(s) · {batch.rows_skipped} fora da plataforma ·{" "}
                  {batch.rows_ignored} ignorada(s)
                </small>
              </span>
              <OrbitaIcon name="arrow" />
            </Link>
          ))
        )}
      </SectionCard>
      {total > BATCH_PAGE_SIZE && (
        <Pagination total={total} page={page} pageSize={BATCH_PAGE_SIZE} path="/importacoes" />
      )}
    </AppShell>
  );
}
