import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import { PanelLeftIcon, PanelRightIcon, PlusIcon, SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { primaryRoutes } from "./workspaceRouteState";
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
  const { state, href } = useWorkspaceRoute();
  const [openSheet, setOpenSheet] = useState<"context" | "summary" | null>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const summaryTrigger = useRef<HTMLButtonElement>(null);

  const setWorkspaceSheet = (sheet: "context" | "summary", open: boolean) => {
    setOpenSheet(open ? sheet : null);
    if (!open) window.setTimeout(() => (sheet === "context" ? contextTrigger : summaryTrigger).current?.focus(), 0);
  };

  useEffect(() => {
    setOpenSheet(null);
  }, [state.path]);

  const routeResetKey = `${state.path}:${window.location.hash}`;

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 shadow-sm backdrop-blur">
        <div className="mx-auto grid max-w-[112rem] grid-cols-[1fr_auto] items-center gap-2 px-3 py-3 sm:px-5 md:grid-cols-[1fr_auto_1fr]">
          <a className="text-lg font-semibold tracking-tight" href={href("/dashboard")}>PocketCoin</a>
          <nav aria-label="Primary financial views" className="order-3 col-span-2 flex gap-1 overflow-x-auto pt-2 md:order-none md:col-span-1 md:justify-center md:pt-0">
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
          <div className="flex items-center justify-end gap-2">
            <Button className="rounded-full" size="icon" variant="ghost" asChild>
              <a aria-label="Settings" href={href("/settings")} title="Settings"><SettingsIcon aria-hidden="true" /></a>
            </Button>
            <Button aria-label="Quick add" className="rounded-full" size="icon" onClick={onQuickAdd}><PlusIcon /></Button>
            <Button ref={contextTrigger} aria-label="Open context panel" className="rounded-full xl:hidden" size="icon" variant="outline" onClick={() => setWorkspaceSheet("context", true)}><PanelLeftIcon /></Button>
            <Button ref={summaryTrigger} aria-label="Open summary panel" className="rounded-full xl:hidden" size="icon" variant="outline" onClick={() => setWorkspaceSheet("summary", true)}><PanelRightIcon /></Button>
          </div>
        </div>
      </header>

      {outage ? (
        <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm">{status}</div>
      ) : status.startsWith("Checking") || status.includes("restored") ? (
        <div role="status" className="border-b bg-background px-4 py-2 text-center text-sm">{status}</div>
      ) : null}
      {feedback ? <p className="sr-only" role="status" aria-live="polite">{feedback}</p> : null}

      <div className="mx-auto grid max-w-[112rem] items-start gap-5 px-3 py-5 sm:px-5 xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
        <aside className="hidden max-h-[calc(100vh-6.25rem)] overflow-y-auto xl:sticky xl:top-20 xl:block" aria-label="Workspace context">
          <LeftWorkspaceRail />
        </aside>
        <main id="main-content" className="min-w-0" tabIndex={-1}>
          <h1 className="sr-only">{title}</h1>
          <RouteErrorBoundary resetKey={routeResetKey}>{children}</RouteErrorBoundary>
        </main>
        <aside className="hidden max-h-[calc(100vh-6.25rem)] overflow-y-auto xl:sticky xl:top-20 xl:block" aria-label="Workspace summary">
          <RightWorkspaceRail currency={currency} locale={locale} />
        </aside>
      </div>

      <Sheet open={openSheet === "context"} onOpenChange={(open) => setWorkspaceSheet("context", open)}>
        <SheetContent side="left" className="overflow-y-auto">
          <SheetHeader><SheetTitle>Context</SheetTitle><SheetDescription>Accounts, management, and workspace tools for this view.</SheetDescription></SheetHeader>
          <div className="mt-5"><LeftWorkspaceRail onAction={() => setWorkspaceSheet("context", false)} /></div>
        </SheetContent>
      </Sheet>
      <Sheet open={openSheet === "summary"} onOpenChange={(open) => setWorkspaceSheet("summary", open)}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader><SheetTitle>Summary</SheetTitle><SheetDescription>Status and supporting financial information.</SheetDescription></SheetHeader>
          <div className="mt-5"><RightWorkspaceRail currency={currency} locale={locale} onAction={() => setWorkspaceSheet("summary", false)} /></div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
