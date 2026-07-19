import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCsvExport } from "./useCsvExport";

describe("useCsvExport", () => {
  it("blocks concurrent exports and reports success", async () => {
    let resolve!: () => void;
    const operation = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const { result } = renderHook(useCsvExport);

    await act(async () => {
      const first = result.current.start(operation);
      void result.current.start(operation);
      resolve();
      await first;
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("success");
    expect(result.current.message).toBe("CSV exported successfully.");
  });

  it("keeps the export available for retry after an error", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("Download failed")).mockResolvedValueOnce(undefined);
    const { result } = renderHook(useCsvExport);

    await act(() => result.current.start(operation));
    expect(result.current.status).toBe("error");
    expect(result.current.message).toBe("Download failed");

    await act(() => result.current.start(operation));
    expect(operation).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("success");
  });
});
