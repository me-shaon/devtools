import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveFile: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/desktop", () => ({ saveFile: mocks.saveFile }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { VideoMetadataCleaner } from "@/components/tools/VideoMetadataCleaner";
import { box, qtText, sampleMp4 } from "./video-fixtures";

const gpsVideo = () => sampleMp4({ moovExtra: [box("udta", qtText("©xyz", "+52.5200+013.4050/"))] }).bytes;

const open = (bytes: Uint8Array, name = "clip.mp4") => {
  const input = document.querySelector<HTMLInputElement>("#video-metadata-file")!;
  fireEvent.change(input, { target: { files: [new File([bytes], name, { type: "video/mp4" })] } });
};

afterEach(() => {
  mocks.saveFile.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("VideoMetadataCleaner", () => {
  it("lists the metadata of an opened video", async () => {
    render(<VideoMetadataCleaner />);
    open(gpsVideo());
    expect(await screen.findByText("GPS position")).toBeInTheDocument();
    expect(screen.getByText("52.52, 13.405")).toBeInTheDocument();
    expect(screen.getAllByText("Removed").length).toBeGreaterThan(0);
  });

  it("saves a clean copy and shows that no removable metadata is left", async () => {
    mocks.saveFile.mockResolvedValue(true);
    render(<VideoMetadataCleaner />);
    open(gpsVideo());
    await screen.findByText("GPS position");
    fireEvent.click(screen.getByRole("button", { name: "Save clean copy" }));
    await waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(1));
    const [blob, name] = mocks.saveFile.mock.calls[0];
    expect(name).toBe("clip-clean.mp4");
    expect((blob as Blob).size).toBe(gpsVideo().length);
    expect(mocks.toast.success).toHaveBeenCalledWith("Saved clip-clean.mp4.");
    expect(await screen.findByText(/The clean copy has no metadata left to remove/)).toBeInTheDocument();
  });

  it("keeps the date when Clear dates is off", async () => {
    render(<VideoMetadataCleaner />);
    open(gpsVideo());
    await screen.findByText("Recording date");
    fireEvent.click(screen.getByRole("switch", { name: "Clear dates" }));
    await waitFor(() => expect(screen.getByText("Recording date").closest(".border-b")).toHaveTextContent("Kept"));
  });

  it("shows an error for a file that is not a video", async () => {
    render(<VideoMetadataCleaner />);
    open(new TextEncoder().encode("not a video at all"), "notes.mp4");
    expect(await screen.findByRole("alert")).toHaveTextContent("This file is not an MP4, MOV, M4V, 3GP, MKV, or WebM video.");
  });
});
