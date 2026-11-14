import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import raw from "../../public/data/console.json";
import { ruleText } from "../features/roofers/Roofers";
import type { Console } from "../shared/types";
import { App, headline } from "./App";

const data = raw as unknown as Console;

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;

afterEach(() => vi.unstubAllGlobals());

describe("console", () => {
  it("shows a skeleton while the report loads", () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    mount();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
  });

  it("explains a failed load and retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 500 })).mockImplementation(() => ok(data)));
    mount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(h1()).toBe(headline(data.dev)));
  });

  it("says what to do when the report has no designs", async () => {
    vi.stubGlobal("fetch", () => ok({ ...data, dev: { ...data.dev, designs: {}, curves: {} } }));
    mount();
    expect(await screen.findByText(/has no designs/)).toBeTruthy();
  });

  it("shows every line of the example quote and its three totals", async () => {
    vi.stubGlobal("fetch", () => ok(data));
    mount();
    const table = await screen.findByRole("table", { name: `Quote for job ${data.dev.example.id}` });
    // header, one row per catalog item, total
    expect(table.querySelectorAll('[role="row"]').length).toBe(data.dev.example.lines.length + 2);
    expect(table.textContent).toContain(`${data.dev.example.llmEdits} edits`);
  });

  it("grows one bar per design in every bucket of ten jobs", async () => {
    vi.stubGlobal("fetch", () => ok(data));
    mount();
    await screen.findByRole("heading", { level: 1 });
    const groups = screen.getAllByRole("group", { name: /^Jobs \d+ to \d+$/ });
    expect(groups.length).toBe(data.dev.curves.gated_rules.length);
    expect(groups[0].querySelectorAll("i").length).toBe(Object.keys(data.dev.curves).length);
  });

  it("opens the replay evidence behind a roofer's rules", async () => {
    vi.stubGlobal("fetch", () => ok(data));
    mount();
    const id = Object.keys(data.dev.learned).find((k) => data.dev.learned[k].length && data.dev.ledger[k]?.length)!;
    const button = await screen.findByRole("button", { name: data.dev.learned[id].map(ruleText).join("; ") });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(new RegExp(data.dev.ledger[id][0].why.replace(/[()]/g, "\\$&")))).toBeTruthy();
  });

  it("switches to the held-out world when there is one", async () => {
    vi.stubGlobal("fetch", () => ok(data));
    mount();
    await screen.findByRole("heading", { level: 1 });
    if (!data.heldout) {
      expect(screen.queryByText("Held-out world")).toBeNull();
      return;
    }
    fireEvent.click(screen.getByText("Held-out world"));
    await waitFor(() => expect(h1()).toBe(headline(data.heldout!)));
  });
});
