"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Field } from "@/components/fields";
import { KeyValueStrip } from "@/components/key-value-strip";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { formatCnpj } from "@/lib/cnpj";
import { competencyLabel } from "@/lib/competency";
import type { ImportPreview, PreviewReferral } from "@/lib/imports/preview";
import { importOutcomeLabels, referralStatusLabels } from "@/lib/labels";
import { formatCurrency, formatInteger } from "@/lib/money";
import { statusChipClass } from "@/lib/referrals/stages";
import { previewImport, uploadImport } from "./actions";

const ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Envio em duas etapas: "Conferir arquivo" roda a importação no banco e desfaz, mostrando o que
// vai mudar; "Confirmar e importar" grava o mesmo arquivo (a impressão dele é conferida). O
// formulário continua montado entre as etapas, então o arquivo escolhido não se perde.
export function ImportForm({ defaultMonth }: { defaultMonth: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();
  const busy = checking || saving;

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setPreview(null);
    startChecking(async () => {
      const result = await previewImport(data);
      if (result.error) {
        setError(result.error);
      } else if (result.preview) {
        setPreview(result.preview);
      }
    });
  }

  function confirm() {
    if (!formRef.current || !preview) {
      return;
    }
    const data = new FormData(formRef.current);
    data.set("expected_hash", preview.file_hash);
    setError(null);
    startSaving(async () => {
      const result = await uploadImport({}, data);
      if (result.error) {
        setError(result.error);
      } else if (result.destination) {
        window.location.assign(result.destination);
      }
    });
  }

  function cancel() {
    formRef.current?.reset();
    setPreview(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        onSubmit={check}
        // Mudou o mês ou o arquivo: a conferência anterior não vale mais.
        onChange={() => {
          setPreview(null);
          setError(null);
        }}
        className="space-y-4"
        aria-busy={busy}
      >
        <fieldset disabled={busy} className="space-y-4">
          <div className="fp-form-grid">
            <Field
              label="Mês de referência"
              name="competency"
              type="month"
              defaultValue={defaultMonth}
              max={defaultMonth}
              required
              hint="O mesmo mês do filtro do BI. O sistema confere com o rodapé do arquivo."
            />
            <Field
              label="Planilha do BI"
              name="file"
              type="file"
              accept={ACCEPT}
              required
              hint="Detalhamento Empresas exportado do BI, em .csv ou .xlsx, sem mexer no arquivo."
            />
          </div>
          {!preview && (
            <Button type="submit">{checking ? "Lendo o arquivo…" : "Conferir arquivo"}</Button>
          )}
        </fieldset>
        {error && !preview && (
          <Notice tone="danger" compact role="alert">
            {error}
          </Notice>
        )}
      </form>

      {preview && (
        <PreviewPanel
          preview={preview}
          saving={saving}
          error={error}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

function difference(before: number, after: number, format: (value: number) => string) {
  const delta = after - before;
  if (Math.abs(delta) < 0.005) {
    return null;
  }
  return (
    <small className={delta > 0 ? "fp-delta-up" : "fp-delta-down"}>
      {delta > 0 ? "+" : "−"}
      {format(Math.abs(delta))}
    </small>
  );
}

// Começo da linha como veio do arquivo, sem as colunas vazias: basta para achar o CNPJ.
function issueContent(rawLine: string): string {
  const cells = rawLine.split(";").filter((cell) => cell.trim() !== "");
  return cells.slice(0, 4).join(" · ");
}

function StatusCell({ referral }: { referral: PreviewReferral }) {
  const after = (
    <span className={statusChipClass(referral.status_after)}>
      {referralStatusLabels[referral.status_after]}
    </span>
  );
  if (referral.status_before === referral.status_after) {
    return after;
  }
  return (
    <span className="fp-status-change">
      <span className={statusChipClass(referral.status_before)}>
        {referralStatusLabels[referral.status_before]}
      </span>
      <span aria-hidden="true">→</span>
      <span className="sr-only">passa a</span>
      {after}
    </span>
  );
}

function ReferralTable({ referrals }: { referrals: PreviewReferral[] }) {
  return (
    <div className="fp-table-wrap">
      <table className="fp-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Parceiro</th>
            <th>Situação</th>
            <th className="fp-num">Vidas hoje</th>
            <th className="fp-num">No arquivo</th>
            <th className="fp-num">Valor por vida</th>
            <th className="fp-num">Valor do mês</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((referral) => (
            <tr key={referral.id}>
              <td>
                <strong>{referral.company_name}</strong>
                <small className="fp-num">{formatCnpj(referral.cnpj)}</small>
              </td>
              <td>{referral.partner_name}</td>
              <td>
                <StatusCell referral={referral} />
              </td>
              <td className="fp-num">{formatInteger(referral.lives_before)}</td>
              <td className="fp-num">
                <strong>{formatInteger(referral.lives_after)}</strong>
                {difference(referral.lives_before, referral.lives_after, formatInteger)}
              </td>
              <td className="fp-num">
                {referral.value_per_life === null ? "—" : formatCurrency(referral.value_per_life)}
              </td>
              <td className="fp-num">
                {/* Com vidas e fora do cálculo: perdida, cancelada ou fora do prazo. */}
                {!referral.counts_after && referral.lives_after > 0 ? (
                  <small>não conta no mês</small>
                ) : (
                  <>
                    <strong>{formatCurrency(referral.amount_after)}</strong>
                    {difference(referral.amount_before, referral.amount_after, formatCurrency)}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewPanel({
  preview,
  saving,
  error,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const month = competencyLabel(preview.competency);
  const inFile = preview.referrals.filter((referral) => referral.in_file);
  const missing = preview.referrals.filter((referral) => !referral.in_file);
  const totals = preview.partners.reduce(
    (sum, partner) => ({
      lives_before: sum.lives_before + partner.lives_before,
      lives_after: sum.lives_after + partner.lives_after,
      amount_before: sum.amount_before + partner.amount_before,
      amount_after: sum.amount_after + partner.amount_after,
    }),
    { lives_before: 0, lives_after: 0, amount_before: 0, amount_after: 0 },
  );
  const changes = preview.referrals.filter(
    (referral) => referral.status_before !== referral.status_after,
  ).length;
  return (
    <section className="fp-preview" aria-label="Conferência do envio">
      <header>
        <h3>Confira antes de importar</h3>
        <p>Nada foi gravado ainda. Se estiver certo, confirme no fim desta conferência.</p>
      </header>

      <KeyValueStrip
        facts={[
          ["Arquivo", preview.file_name],
          ["Mês", `${month} (${preview.complete ? "mês completo" : "parcial"})`],
          ["Linhas lidas", formatInteger(preview.rows_read)],
          ["Indicações no arquivo", formatInteger(preview.rows_imported)],
          ["Fora da plataforma", formatInteger(preview.rows_skipped)],
          ["Ignoradas", formatInteger(preview.rows_ignored)],
        ]}
      />

      {preview.closed ? (
        <Notice tone="warning" title={`${month} já está fechado`}>
          Este envio não muda nenhum valor: as linhas ficam registradas como “Mês já fechado”.
        </Notice>
      ) : preview.complete ? (
        <Notice tone="warning" title="Este envio completa o mês">
          Feito depois do fim de {month}: libera o fechamento do mês e marca como Inadimplente a
          indicação ativa sem vidas no arquivo.
        </Notice>
      ) : (
        <Notice tone="info" title="Envio parcial">
          {month} ainda não terminou: o envio substitui as vidas do mês, atualiza a prévia dos
          parceiros e não marca ninguém como inadimplente.
        </Notice>
      )}
      {preview.rows_imported === 0 && !preview.closed && (
        <Notice tone="warning" title="Nenhuma empresa indicada aparece no arquivo">
          Se confirmar, as vidas de {month} ficam zeradas para todas as indicações.
        </Notice>
      )}

      <p className="fp-preview-summary">
        {month}: <strong>{formatInteger(totals.lives_after)} vidas</strong> e{" "}
        <strong>{formatCurrency(totals.amount_after)}</strong> com este envio (hoje:{" "}
        {formatInteger(totals.lives_before)} vidas e {formatCurrency(totals.amount_before)}).
        {changes > 0 && ` ${changes} indicação(ões) mudam de situação.`}
      </p>

      {preview.partners.length > 0 && (
        <div className="space-y-2">
          <h4>Por parceiro</h4>
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th className="fp-num">Vidas hoje</th>
                  <th className="fp-num">Vidas com o envio</th>
                  <th className="fp-num">Valor hoje</th>
                  <th className="fp-num">Valor com o envio</th>
                </tr>
              </thead>
              <tbody>
                {preview.partners.map((partner) => (
                  <tr key={partner.partner_name}>
                    <td>
                      <strong>{partner.partner_name}</strong>
                    </td>
                    <td className="fp-num">{formatInteger(partner.lives_before)}</td>
                    <td className="fp-num">
                      <strong>{formatInteger(partner.lives_after)}</strong>
                      {difference(partner.lives_before, partner.lives_after, formatInteger)}
                    </td>
                    <td className="fp-num">{formatCurrency(partner.amount_before)}</td>
                    <td className="fp-num">
                      <strong>{formatCurrency(partner.amount_after)}</strong>
                      {difference(partner.amount_before, partner.amount_after, formatCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inFile.length > 0 && (
        <div className="space-y-2">
          <h4>Indicações que estão no arquivo ({inFile.length})</h4>
          <ReferralTable referrals={inFile} />
        </div>
      )}

      {missing.length > 0 && (
        <div className="space-y-2">
          <h4>Indicações que não aparecem no arquivo ({missing.length})</h4>
          <p className="fp-preview-note">
            Ficam com 0 vidas em {month}.
            {preview.complete
              ? " Como o envio completa o mês, a ativa sem vidas passa a Inadimplente."
              : " Num envio parcial elas continuam como estão: o cliente ainda pode pagar até o fim do mês."}
          </p>
          <ReferralTable referrals={missing} />
        </div>
      )}

      {preview.issues.length > 0 && (
        <div className="space-y-2">
          <h4>Linhas que não entram ({preview.issues.length})</h4>
          <div className="fp-table-wrap">
            <table className="fp-table">
              <thead>
                <tr>
                  <th className="fp-num">Linha</th>
                  <th>Resultado</th>
                  <th>Motivo</th>
                  <th>Conteúdo da linha</th>
                </tr>
              </thead>
              <tbody>
                {preview.issues.map((issue) => (
                  <tr key={`${issue.line_number}-${issue.reason}`}>
                    <td className="fp-num">{issue.line_number}</td>
                    <td>
                      {importOutcomeLabels[issue.outcome as keyof typeof importOutcomeLabels] ??
                        issue.outcome}
                    </td>
                    <td>{issue.reason}</td>
                    <td>
                      <small className="fp-num">{issueContent(issue.raw_line)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="fp-preview-actions">
        <Button type="button" onClick={onConfirm} disabled={saving}>
          {saving ? "Importando…" : "Confirmar e importar"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
      {error && (
        <Notice tone="danger" compact role="alert">
          {error}
        </Notice>
      )}
    </section>
  );
}
