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
      <div className="flow-root">
        {actions ? <div className="float-right mb-2 ml-3 min-w-0">{actions}</div> : null}
        <h2 id={titleId} className="min-w-0 text-base font-semibold tracking-tight text-foreground text-balance">
          {title}
        </h2>
        {description ? (
          <div className="text-sm text-muted-foreground text-pretty">{description}</div>
        ) : null}
        {period ? <div>{period}</div> : null}
      </div>
      <div className={cn("clear-both mt-5", contentClassName)}>{children}</div>
    </section>
  );
}
