import type { ReferralStatus } from "@/lib/labels";

// Espelho, para a interface, da matriz da função SQL set_referral_status (que é a autoridade).
const manualTransitions: Record<ReferralStatus, ReferralStatus[]> = {
  referred: ["negotiating", "signed", "lost"],
  negotiating: ["signed", "lost"],
  signed: ["negotiating", "lost"],
  active: ["cancelled"],
  delinquent: ["cancelled"],
  lost: ["negotiating"],
  cancelled: [],
};

export function allowedTransitions(status: string): ReferralStatus[] {
  return manualTransitions[status as ReferralStatus] ?? [];
}
