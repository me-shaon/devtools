import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.fn(async (_blob: Blob, _name: string) => true);
vi.mock("@/lib/desktop", () => ({ saveFile: (b: Blob, n: string) => saveFile(b, n) }));

import { HarViewer } from "@/components/tools/HarViewer";

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const timings = { blocked: 2, dns: -1, connect: -1, ssl: -1, send: 1, wait: 120, receive: 7 };

const HAR = {
  log: {
    version: "1.2",
    creator: { name: "WebInspector", version: "537.36" },
    pages: [{ id: "page_1", title: "Shop", startedDateTime: "2026-01-10T10:00:00.000Z", pageTimings: { onLoad: 900 } }],
    entries: [
      {
        pageref: "page_1",
        startedDateTime: "2026-01-10T10:00:00.000Z",
        time: 130,
        _resourceType: "document",
        request: {
          method: "GET",
          url: "https://shop.example.com/cart?item=42",
          httpVersion: "HTTP/2",
          headers: [{ name: "Cookie", value: "sid=s3cret" }],
          cookies: [{ name: "sid", value: "s3cret" }],
          queryString: [{ name: "item", value: "42" }],
          headersSize: -1,
          bodySize: 0,
        },
        response: {
          status: 200,
          statusText: "OK",
          httpVersion: "HTTP/2",
          headers: [{ name: "Content-Type", value: "text/html" }],
          cookies: [],
          content: { size: 30, mimeType: "text/html", text: "<html><body>Cart</body></html>" },
          redirectURL: "",
          headersSize: -1,
          bodySize: -1,
          _transferSize: 512,
        },
        timings,
      },
      {
        startedDateTime: "2026-01-10T10:00:00.200Z",
        time: 300,
        _resourceType: "fetch",
        request: {
          method: "POST",
          url: "https://api.example.com/orders",
          httpVersion: "HTTP/2",
          headers: [
            { name: "Authorization", value: "Bearer abc.def.ghi" },
            { name: "Content-Type", value: "application/json" },
          ],
          cookies: [],
          queryString: [],
          postData: { mimeType: "application/json", text: '{"item":42,"qty":1}' },
          headersSize: -1,
          bodySize: 19,
        },
        response: {
          status: 500,
          statusText: "Internal Server Error",
          headers: [],
          cookies: [],
          content: { size: 16, mimeType: "application/json", text: btoa('{"error":"boom"}'), encoding: "base64" },
          headersSize: -1,
          bodySize: 16,
        },
        timings,
      },
      {
        startedDateTime: "2026-01-10T10:00:00.300Z",
        time: 40,
        _resourceType: "image",
        request: { method: "GET", url: "https://cdn.example.com/logo.png", httpVersion: "HTTP/2", headers: [], cookies: [], queryString: [], headersSize: -1, bodySize: 0 },
        response: {
          status: 304,
          statusText: "Not Modified",
          headers: [],
          cookies: [],
          content: { size: 68, mimeType: "image/png", text: PNG_BASE64, encoding: "base64" },
          headersSize: -1,
          bodySize: 0,
        },
        timings,
      },
    ],
  },
};

const paste = (value: unknown) =>
  fireEvent.change(screen.getByLabelText("HAR"), { target: { value: typeof value === "string" ? value : JSON.stringify(value) } });

const table = () => screen.getByRole("table", { name: "Requests" });
const bodyRows = () => within(table()).getAllByRole("row").filter((row) => row.hasAttribute("aria-rowindex"));

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe("HarViewer", () => {
  beforeEach(() => {
    saveFile.mockClear();
    vi.mocked(navigator.clipboard.writeText).mockClear();
  });

  it("lists pasted requests and summarizes the archive", async () => {
    render(<HarViewer />);
    paste(HAR);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(screen.getByRole("status")).toHaveTextContent("3 requests");
    expect(screen.getByRole("status")).toHaveTextContent("1 error");
    expect(screen.getByRole("status")).toHaveTextContent("Page: Shop (load 900 ms)");
    expect(within(bodyRows()[1]).getByText("500")).toHaveClass("text-destructive");
    expect(within(bodyRows()[0]).getByText("shop.example.com")).toBeInTheDocument();
    expect(screen.getByText("Showing 3 of 3 requests")).toBeInTheDocument();
  });

  it("explains invalid JSON and JSON that is not a HAR file", async () => {
    render(<HarViewer />);
    paste("{not json");
    expect(await screen.findByRole("alert")).toHaveTextContent("not valid JSON");
    paste({ log: { version: "1.2" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("log.entries array is missing"));
  });

  it("filters by status class, type, and text, and sorts by a column", async () => {
    render(<HarViewer />);
    paste(HAR);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "5xx" } });
    expect(bodyRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "img" } });
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]).getByText("304")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filter requests"), { target: { value: "orders" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Filter requests"), { target: { value: "" } });
    await waitFor(() => expect(bodyRows()).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "Time" }));
    expect(within(bodyRows()[0]).getByText("POST")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Time/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("shows the details of the selected request and copies it as cURL", async () => {
    render(<HarViewer />);
    paste(HAR);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    fireEvent.click(bodyRows()[1]);
    expect(screen.getByRole("table", { name: "Request headers" })).toHaveTextContent("Bearer abc.def.ghi");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Request" }));
    expect(await screen.findByLabelText("Request body")).toHaveTextContent('"qty": 1');
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Response" }));
    expect(await screen.findByLabelText("Response body")).toHaveTextContent('"error": "boom"');
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Timings" }));
    const timingTable = await screen.findByRole("table", { name: "Timings" });
    expect(within(timingTable).getByRole("row", { name: /DNS lookup/ })).toHaveTextContent("n/a");
    expect(within(timingTable).getByRole("row", { name: /Wait/ })).toHaveTextContent("120 ms");

    fireEvent.click(screen.getByRole("button", { name: "Copy as cURL" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const curl = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(curl).toContain("curl https://api.example.com/orders");
    expect(curl).toContain("-H 'Authorization: Bearer abc.def.ghi'");
    expect(curl).toContain(`--data-raw '{"item":42,"qty":1}'`);

    fireEvent.click(screen.getByRole("button", { name: "Copy response body" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2));
    expect(vi.mocked(navigator.clipboard.writeText).mock.calls[1][0]).toBe('{\n  "error": "boom"\n}');
  });

  it("shows image responses and query parameters", async () => {
    render(<HarViewer />);
    paste(HAR);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    fireEvent.click(bodyRows()[0]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Query" }));
    expect(await screen.findByRole("table", { name: "Query parameters" })).toHaveTextContent("item42");
    fireEvent.click(bodyRows()[2]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Response" }));
    expect(await screen.findByRole("img")).toHaveAttribute("src", `data:image/png;base64,${PNG_BASE64}`);
  });

  it("moves the selection with the arrow keys", async () => {
    render(<HarViewer />);
    paste(HAR);
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    const scroller = screen.getByLabelText(/Use the arrow keys/);
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    expect(bodyRows()[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(scroller, { key: "ArrowDown" });
    expect(bodyRows()[1]).toHaveAttribute("aria-selected", "true");
  });

  it("renders only the rows in view for large archives", async () => {
    render(<HarViewer />);
    const entries = Array.from({ length: 3000 }, (_, i) => ({ ...HAR.log.entries[0], request: { ...HAR.log.entries[0].request, url: `https://shop.example.com/item/${i}` } }));
    paste({ log: { ...HAR.log, entries } });
    await waitFor(() => expect(screen.getByText("Showing 3000 of 3000 requests")).toBeInTheDocument());
    expect(bodyRows().length).toBeLessThan(100);
  });

  it("shows an entry that has no response without a crash", async () => {
    render(<HarViewer />);
    paste({ log: { entries: [{ request: { method: "GET", url: "https://x.test/only-request" } }] } });
    await waitFor(() => expect(bodyRows()).toHaveLength(1));
    fireEvent.click(bodyRows()[0]);
    expect(screen.getByText("The response has no headers.")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Response" }));
    expect(await screen.findByText(/no response body/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy response body" })).toBeDisabled();
  });

  it("saves a sanitized copy when the HAR has null entries", async () => {
    render(<HarViewer />);
    paste({ log: { ...HAR.log, entries: [...HAR.log.entries, null] } });
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Save sanitized HAR" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const saved = JSON.parse(await readBlob(saveFile.mock.calls[0][0]));
    expect(saved.log.entries).toHaveLength(4);
    expect(saved.log.entries[3]).toBeNull();
  });

  it("sorts by start time by default and keeps that order when a filter is set and cleared", async () => {
    render(<HarViewer />);
    const [a, b, c] = HAR.log.entries;
    paste({ log: { ...HAR.log, entries: [c, a, b] } });
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    const order = () => bodyRows().map((row) => row.querySelector("td")?.textContent);
    expect(order()).toEqual(["GET", "POST", "GET"]);
    expect(screen.getByRole("columnheader", { name: /Waterfall/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "GET" } });
    expect(bodyRows().map((row) => row.textContent)).toEqual([expect.stringContaining("shop.example.com"), expect.stringContaining("cdn.example.com")]);
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "" } });
    expect(order()).toEqual(["GET", "POST", "GET"]);
    expect(within(bodyRows()[0]).getByText("shop.example.com")).toBeInTheDocument();
  });

  it("opens a .har file and saves a sanitized copy", async () => {
    render(<HarViewer />);
    const file = new File([JSON.stringify(HAR)], "shop.har", { type: "application/json" });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(bodyRows()).toHaveLength(3));
    expect(screen.getByText("shop.har")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Remove response bodies" }));
    fireEvent.click(screen.getByRole("button", { name: "Save sanitized HAR" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("shop.sanitized.har");
    const saved = await readBlob(saveFile.mock.calls[0][0]);
    expect(saved).not.toContain("s3cret");
    expect(saved).not.toContain("abc.def.ghi");
    expect(saved).not.toContain("Cart</body>");
    expect(JSON.parse(saved).log.entries).toHaveLength(3);
  });
});
