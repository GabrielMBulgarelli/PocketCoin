import { Repeat2Icon } from "lucide-react";

import type { PaymentRecurrence } from "../../api/plannedPayments";

export function RecurringPaymentIcon({ recurrence }: { recurrence: PaymentRecurrence }) {
  if (recurrence === "none") return null;

  return (
    <span
      aria-label={`Recurring ${recurrence}`}
      className="inline-flex shrink-0 text-muted-foreground"
      role="img"
    >
      <Repeat2Icon aria-hidden="true" className="size-4" />
    </span>
  );
}
