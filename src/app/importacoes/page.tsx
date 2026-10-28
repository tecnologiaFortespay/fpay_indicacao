import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/fields";
import { MutationForm } from "@/components/mutation-form";
import { OrbitaIcon } from "@/components/orbita-icon";
import { requireRole } from "@/lib/auth/session";
import { competencyLabel, dateToCompetency, formatDateTime } from "@/lib/competency";
import { BATCH_PAGE_SIZE, latestImport, listBatches } from "@/lib/imports/queries";
import { uploadImport } from "./actions";

export const metadata: Metadata = { title: "Importações" };

type PageProps = { searchParams: Promise<{ page?: string }> };

export default async function ImportsPage({ searchParams }: PageProps) {
  await requireRole("director", "analyst");
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1));
  const [{ items, total }, last] = await Promise.all([listBatches(page), latestImport()]);
  return (
    <AppShell title="Importações">
      <section className="fp-panel">
        <div className="fp-panel-heading">
          <h2>Enviar CSV do BI</h2>
          <span>
            {last
              ? `Última importação em ${formatDateTime(last.created_at)} por ${last.author}`
              : "Nenhuma importação ainda"}
          </span>
        </div>
        <div className="fp-form-section">
          <p className="mb-4 text-sm text-muted-foreground">
            Envie o arquivo exatamente como sai do BI (colunas grupo, empresa, CNPJ, vidas e mês).
            Cada mês presente no arquivo substitui os dados daquele mês; subir o mesmo arquivo duas
            vezes não duplica vidas. Limite: 5 MB.
          </p>
          <MutationForm action={uploadImport} label="Importar" pendingLabel="Importando…">
            <label className="block text-sm font-medium">
              Arquivo CSV
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                required
                className="mt-2 block w-full rounded border p-3"
              />
            </label>
          </MutationForm>
        </div>
      </section>

      <section className="fp-panel mt-6">
        <div className="fp-panel-heading">
          <h2>Importações realizadas</h2>
          <span>{total} lote(s)</span>
        </div>
        {items.map((batch) => (
          <Link className="fp-action-row" key={batch.id} href={`/importacoes/${batch.id}`}>
            <span>
              <strong>{batch.file_name}</strong>
              <small>
                {formatDateTime(batch.created_at)} · {batch.author} ·{" "}
                {batch.competencies
                  .map((date) => competencyLabel(dateToCompetency(date)))
                  .join(", ") || "sem mês"}{" "}
                · {batch.rows_imported} importada(s) · {batch.rows_ignored} ignorada(s)
              </small>
            </span>
            <OrbitaIcon name="arrow" />
          </Link>
        ))}
        {items.length === 0 && <p className="fp-panel-footnote">Nenhuma importação registrada.</p>}
      </section>
      {total > BATCH_PAGE_SIZE && (
        <Pagination total={total} page={page} pageSize={BATCH_PAGE_SIZE} path="/importacoes" />
      )}
    </AppShell>
  );
}
