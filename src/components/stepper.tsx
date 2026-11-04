export type StepState = "done" | "current" | "blocked" | "upcoming";

export type Step = {
  title: string;
  state: StepState;
  text: React.ReactNode;
  action?: React.ReactNode;
};

const stateLabels: Record<StepState, string> = {
  done: "Concluída",
  current: "Agora",
  blocked: "Bloqueada",
  upcoming: "Depois",
};

// Etapas numeradas com o estado visível (feita, agora, bloqueada, depois).
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="fp-steps" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.title} data-state={step.state}>
          <span className="fp-step-badge">
            <b aria-hidden="true">{step.state === "done" ? "✓" : index + 1}</b>
            {stateLabels[step.state]}
          </span>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          {step.action}
        </li>
      ))}
    </ol>
  );
}
