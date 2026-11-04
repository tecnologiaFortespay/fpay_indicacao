import type { AiAlert } from "@/lib/ai/claude";
import type { StoredReview } from "@/lib/ai/reviews";
import type { FormState } from "@/lib/auth/validation";
import { formatDateTime } from "@/lib/competency";
import { MutationForm } from "./mutation-form";
import { Notice } from "./notice";
import { RefreshWhileRunning } from "./refresh-while-running";

const severity: Record<AiAlert["gravidade"], { label: string; className: string }> = {
  alta: { label: "Alta", className: "fp-status fp-status-danger" },
  media: { label: "Média", className: "fp-status fp-status-pending" },
  baixa: { label: "Baixa", className: "fp-status fp-status-success" },
};

type AiReviewPanelProps = {
  title: string;
  description: string;
  review: StoredReview | null;
  configured: boolean;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  // Ex.: o cálculo mudou depois da análise.
  notice?: string | null;
  // Falso quando não cabe nova análise (ex.: mês já fechado).
  canRequest?: boolean;
};

// Análise da IA de um envio ou de um fechamento. Só aparece para o diretor.
export function AiReviewPanel({
  title,
  description,
  review,
  configured,
  action,
  fields,
  notice,
  canRequest = true,
}: AiReviewPanelProps) {
  const running = review?.status === "running";
  return (
    <section className="fp-panel" aria-label={title}>
      <header className="fp-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>
            {running
              ? "analisando…"
              : review
                ? `${review.status === "failed" ? "falhou" : "feita"} em ${formatDateTime(review.created_at)}`
                : "ainda não pedida"}
          </p>
        </div>
      </header>
      <div className="fp-panel-body">
        <p className="fp-help">{description}</p>
        {!configured && (
          <Notice tone="warning" compact>
            A IA ainda não está ligada neste servidor: falta configurar a chave ANTHROPIC_API_KEY.
          </Notice>
        )}
        {running && (
          <Notice tone="info" compact role="status">
            A IA está analisando. Esta página se atualiza sozinha; costuma levar menos de um minuto.
            <RefreshWhileRunning />
          </Notice>
        )}
        {review?.status === "failed" && (
          <Notice tone="danger" compact>
            {review.error}
          </Notice>
        )}
        {review?.status === "done" && (
          <>
            {notice && (
              <Notice tone="warning" compact>
                {notice}
              </Notice>
            )}
            <p>{review.summary}</p>
            {review.alerts.length > 0 && (
              <ul className="space-y-3">
                {review.alerts.map((alert, index) => (
                  <li key={index} className="fp-notice fp-notice-compact">
                    <span>
                      <span className={severity[alert.gravidade].className}>
                        {severity[alert.gravidade].label}
                      </span>{" "}
                      <strong>{alert.titulo}</strong>
                    </span>
                    <span>{alert.detalhe}</span>
                    {(alert.parceiro || alert.empresa) && (
                      <small className="fp-help">
                        {[alert.parceiro, alert.empresa].filter(Boolean).join(" · ")}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {configured && canRequest && !running && (
          <MutationForm
            action={action}
            label={review ? "Analisar de novo" : "Analisar com IA"}
            pendingLabel="Enviando à IA…"
            variant="outline"
          >
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </MutationForm>
        )}
      </div>
    </section>
  );
}
