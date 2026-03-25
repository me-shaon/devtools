import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImageConverter } from "@/components/tools/ImageConverter";

describe("ImageConverter", () => {
  it("renders single and bulk compression workflows", () => {
    render(<ImageConverter />);

    expect(screen.getByText("Image Converter & Compressor")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Single Image" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bulk Compress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload Image" })).toBeInTheDocument();
    expect(screen.getByText("Compression Notes")).toBeInTheDocument();
  });
});
