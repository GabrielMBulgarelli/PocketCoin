import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { primaryRoutes, secondaryRoutes } from "./workspaceRouteState";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import { LeftWorkspaceRail, RightWorkspaceRail } from "./WorkspaceRails";

type WorkspaceShellProps = {
  children: ReactNode;
  currency: string;
  feedback: string;
  locale: string;
  onQuickAdd: () => void;
  outage: boolean;
  status: string;
  title: string;
};

class RouteErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route content failed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="rounded-2xl border border-destructive/35 bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">This view could not be displayed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Navigation, Quick Add, API status, and Data Safety remain available while you leave or retry this view.
          </p>
          <Button className="mt-4" onClick={() => this.setState({ failed: false })}>Retry view</Button>
        </section>
      );
    }
    return this.props.children;
  }
}

export function WorkspaceShell({ children, currency, feedback, locale, onQuickAdd, outage, status, title }: WorkspaceShellProps) {
  const { state, href, update } = useWorkspaceRoute();
  const [openSheet, setOpenSheet] = useState<"context" | "summary" | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const priorSheet = useRef(openSheet);

  useEffect(() => {
    if (priorSheet.current && priorSheet.current !== openSheet) priorSheet.current = openSheet;
  }, [openSheet]);

  useEffect(() => setOpenSheet(null), [state.path]);

  const planningMode = state.planning ?? "budgets";
  const routeResetKey = `${state.path}:${window.location.hash}`;

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[112rem] items-center gap-2 px-3 py-3 sm:px-5">
          <a className="mr-auto text-lg font-semibold tracking-tight" href={href("/dashboard")}>PocketCoin</a>
          <Button className="hidden xl:inline-flex" size="sm" variant="ghost" asChild><a href={href("/settings")}>Settings</a></Button>
          <Button aria-label="Quick add" className="rounded-full" size="sm" onClick={onQuickAdd}>+</Button>
          <Button ref={navigationTrigger} aria-label="Open navigation menu" className="rounded-full" size="sm" variant="outline" onClick={() => setNavigationOpen(true)}>☰</Button>
          <Button className="rounded-full xl:hidden" size="sm" variant="outline" onClick={() => setOpenSheet("context")}>Context</Button>
          <Button className="rounded-full xl:hidden" size="sm" variant="outline" onClick={() => setOpenSheet("summary")}>Summary</Button>
        </div>
        <nav aria-label="Primary financial views" className="mx-auto flex max-w-[112rem] gap-1 overflow-x-auto px-3 pb-3 sm:px-5">
          {primaryRoutes.map((route) => (
            <a
              key={route.path}
              href={href(route.path)}
              aria-current={state.path === route.path ? "page" : undefined}
              className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", state.path === route.path ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {route.primaryLabel ?? route.title}
            </a>
          ))}
        </nav>
      </header>

      {outage ? (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm">{status}</div>
      ) : status.startsWith("Checking") || status.includes("restored") ? (
        <div role="status" className="border-b bg-background px-4 py-2 text-center text-sm">{status}</div>
      ) : null}
      {feedback ? <p className="sr-only" role="status" aria-live="polite">{feedback}</p> : null}

      <div className="mx-auto grid max-w-[112rem] gap-5 px-3 py-5 sm:px-5 xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
        <aside className="hidden max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-32 xl:block" aria-label="Workspace context">
          <LeftWorkspaceRail />
        </aside>
        <main id="main-content" className="min-w-0" tabIndex={-1}>
          {state.path === "/budgets" ? (
            <nav aria-label="Planning views" className="mb-4 flex gap-2 rounded-2xl border bg-card p-2 shadow-sm">
              {(["budgets", "upcoming"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={planningMode === mode ? "default" : "ghost"}
                  aria-current={planningMode === mode ? "page" : undefined}
                  onClick={() => update({ planning: mode })}
                >
                  {mode === "budgets" ? "Budgets" : "Upcoming"}
                </Button>
              ))}
            </nav>
          ) : null}
          <h1 className="sr-only">{title}</h1>
          <RouteErrorBoundary resetKey={routeResetKey}>{children}</RouteErrorBoundary>
        </main>
        <aside className="hidden max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border bg-card p-4 shadow-sm xl:sticky xl:top-32 xl:block" aria-label="Workspace summary">
          <RightWorkspaceRail currency={currency} locale={locale} />
        </aside>
      </div>

      <Sheet open={openSheet === "context"} onOpenChange={(open) => setOpenSheet(open ? "context" : null)}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader><SheetTitle>Context</SheetTitle><SheetDescription>Accounts, management, and quick tools.</SheetDescription></SheetHeader>
          <div className="mt-5"><LeftWorkspaceRail onAction={() => setOpenSheet(null)} /></div>
        </SheetContent>
      </Sheet>
      <Sheet open={openSheet === "summary"} onOpenChange={(open) => setOpenSheet(open ? "summary" : null)}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader><SheetTitle>Summary</SheetTitle><SheetDescription>Status and supporting financial information.</SheetDescription></SheetHeader>
          <div className="mt-5"><RightWorkspaceRail currency={currency} locale={locale} onAction={() => setOpenSheet(null)} /></div>
        </SheetContent>
      </Sheet>
      <Sheet open={navigationOpen} onOpenChange={(open) => { setNavigationOpen(open); if (!open) window.setTimeout(() => navigationTrigger.current?.focus(), 0); }}>
        <SheetContent side="right">
          <SheetHeader><SheetTitle>Navigation</SheetTitle><SheetDescription>Open a PocketCoin workspace or management view.</SheetDescription></SheetHeader>
          <nav aria-label="Application navigation" className="mt-5 grid gap-2">
            {[...primaryRoutes, ...secondaryRoutes].map((route) => (
              <a
                key={route.path}
                href={href(route.path)}
                aria-current={state.path === route.path ? "page" : undefined}
                className={cn("rounded-lg px-4 py-3 text-sm font-medium hover:bg-muted", state.path === route.path && "bg-muted")}
                onClick={() => setNavigationOpen(false)}
              >
                {route.title}
              </a>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
