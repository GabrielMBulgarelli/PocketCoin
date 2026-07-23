import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportView } from "./ImportView";

afterEach(() => vi.unstubAllGlobals());

describe("ImportView", () => {
  it("uses an unnumbered upload heading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={client}><ImportView currency="USD" locale="en-US" /></QueryClientProvider>);

    expect(screen.getByRole("heading", { name: "Upload a statement" })).toBeInTheDocument();
    expect(screen.queryByText("1. Upload a statement")).not.toBeInTheDocument();
  });
});
