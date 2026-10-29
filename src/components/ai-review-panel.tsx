import type { AiAlert } from "@/lib/ai/claude";
import type { StoredReview } from "@/lib/ai/reviews";
import type { FormState } from "@/lib/auth/validation";
import { formatDateTime } from "@/lib/competency";
import { MutationForm } from "./mutation-form";
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
    <section className="fp-panel mt-6" aria-label={title}>
      <div className="fp-panel-heading">
        <h2>{title}</h2>
        <span>
          {running
            ? "analisando…"
            : review
              ? `${review.status === "failed" ? "falhou" : "feita"} em ${formatDateTime(review.created_at)}`
              : "ainda não pedida"}
        </span>
      </div>
      <div className="fp-form-section space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        {!configured && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            A IA ainda não está ligada neste servidor: falta configurar a chave ANTHROPIC_API_KEY.
          </p>
        )}
        {running && (
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            A IA está analisando. Esta página se atualiza sozinha em alguns segundos.
            <RefreshWhileRunning />
          </p>
        )}
        {review?.status === "failed" && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{review.error}</p>
        )}
        {review?.status === "done" && (
          <>
            {notice && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{notice}</p>
            )}
            <p className="text-sm">{review.summary}</p>
            {review.alerts.length > 0 && (
              <ul className="space-y-3">
                {review.alerts.map((alert, index) => (
                  <li key={index} className="rounded-lg border p-3 text-sm">
                    <span className={severity[alert.gravidade].className}>
                      {severity[alert.gravidade].label}
                    </span>{" "}
                    <strong>{alert.titulo}</strong>
                    <p className="mt-1">{alert.detalhe}</p>
                    {(alert.parceiro || alert.empresa) && (
                      <small className="text-muted-foreground">
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
