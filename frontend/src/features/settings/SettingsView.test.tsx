import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "../../api/settings";
import { updateSettings } from "../../api/settings";
import { exportTransactions } from "../../api/transactions";
import { BackupControllerProvider } from "../../app/BackupControllerContext";
import { SettingsView } from "./SettingsView";

vi.mock("../../api/backups", () => ({
  createBackup: vi.fn(),
  listBackups: vi.fn().mockResolvedValue([]),
  restoreBackup: vi.fn(),
}));

vi.mock("../../api/settings", () => ({ updateSettings: vi.fn() }));
vi.mock("../../api/transactions", () => ({ exportTransactions: vi.fn() }));

const settings: Settings = {
  base_currency: "CRC",
  locale: "es-CR",
  first_day_of_week: "monday",
  theme: "light",
};

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <BackupControllerProvider>
        <SettingsView settings={settings} loading={false} loadError={false} />
      </BackupControllerProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsView", () => {
  beforeEach(() => {
    vi.mocked(updateSettings).mockResolvedValue(settings);
    vi.mocked(exportTransactions).mockResolvedValue();
  });

  it("uses fixed currency and locale selects submitted by the card header action", async () => {
    vi.mocked(updateSettings).mockImplementation(async (submitted) => submitted);
    renderSettings();

    const currency = screen.getByRole("combobox", { name: "Currency" });
    const locale = screen.getByRole("combobox", { name: "Locale" });
    expect(currency.tagName).toBe("SELECT");
    expect(locale.tagName).toBe("SELECT");
    expect(within(currency).getAllByRole("option").map((option) => option.textContent)).toEqual(["CRC", "USD", "EUR"]);
    expect(within(locale).getAllByRole("option").map((option) => option.textContent)).toEqual(["es-CR", "en-US"]);

    fireEvent.change(currency, { target: { value: "USD" } });
    fireEvent.change(locale, { target: { value: "en-US" } });

    const heading = screen.getByRole("heading", { name: "Display preferences" });
    const card = heading.closest("section");
    const form = card?.querySelector("form");
    const save = within(card as HTMLElement).getByRole("button", { name: "Save settings" });
    expect(save).toHaveAttribute("form", "display-preferences-form");
    expect(form).not.toContainElement(save);

    fireEvent.click(save);

    await waitFor(() => expect(vi.mocked(updateSettings).mock.calls[0]?.[0]).toEqual({
      ...settings,
      base_currency: "USD",
      locale: "en-US",
    }));
  });

  it("shows successful CSV feedback in an alert panel", async () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Export full history" }));

    const status = await screen.findByRole("status", { name: "CSV export status" });
    expect(status).toHaveTextContent("CSV exported successfully.");
    expect(status).toHaveClass("rounded-lg", "border");
  });
});
