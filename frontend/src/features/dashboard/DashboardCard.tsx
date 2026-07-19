import { useId, type PropsWithChildren, type ReactNode } from "react";

import { cn } from "../../lib/utils";

type DashboardCardProps = PropsWithChildren<{
  title: string;
  description?: ReactNode;
  period?: ReactNode;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
}>;

export function DashboardCard({
  title,
  description,
  period,
  actions,
  className,
  contentClassName,
  children,
}: DashboardCardProps) {
  const titleId = `dashboard-card-${useId().replaceAll(":", "")}`;

  return (
    <section
      aria-labelledby={titleId}
      className={cn("min-w-0 rounded-xl border bg-card p-5 shadow-sm", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground text-balance">
            {title}
          </h2>
          {description ? (
            <div className="mt-1 text-sm text-muted-foreground text-pretty">{description}</div>
          ) : null}
          {period ? <div className="mt-1">{period}</div> : null}
        </div>
        {actions ? <div className="min-w-0 shrink-0">{actions}</div> : null}
      </div>
      <div className={cn("mt-5", contentClassName)}>{children}</div>
    </section>
  );
}
