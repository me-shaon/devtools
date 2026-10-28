import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChmodCalculator } from "@/components/tools/ChmodCalculator";

describe("ChmodCalculator", () => {
  it("makes the octal mode the first text field so pasted text lands in it", () => {
    const { container } = render(<ChmodCalculator />);
    expect(container.querySelector('input[type="text"]')).toBe(screen.getByLabelText("Octal"));
    expect(screen.getByText("What is the difference between x and X?")).toBeInTheDocument();
  });

  it("syncs octal, symbolic, the grid, and the commands", () => {
    render(<ChmodCalculator />);
    fireEvent.change(screen.getByLabelText("Octal"), { target: { value: "0640" } });

    expect(screen.getByLabelText("Symbolic")).toHaveValue("rw-r-----");
    expect(screen.getByLabelText("Owner write")).toBeChecked();
    expect(screen.getByLabelText("Group write")).not.toBeChecked();
    expect(screen.getByLabelText("Octal command")).toHaveTextContent("chmod 640 file");
    expect(screen.getByLabelText("Symbolic command")).toHaveTextContent("chmod u=rw,g=r,o= file");
    expect(screen.getByLabelText("ls -l")).toHaveTextContent("-rw-r-----");
    expect(screen.getByText("Owner can read and write.")).toBeInTheDocument();
    expect(screen.getByText("Others has no access.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Group write"));
    expect(screen.getByLabelText("Octal")).toHaveValue("660");
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rw-rw----");
  });

  it("reads an ls -l string with special bits and sets the directory switch", () => {
    render(<ChmodCalculator />);
    fireEvent.change(screen.getByLabelText("Symbolic"), { target: { value: "drwxrwxrwt" } });

    expect(screen.getByLabelText("Octal")).toHaveValue("1777");
    expect(screen.getByLabelText("Sticky")).toBeChecked();
    expect(screen.getByRole("switch", { name: "Directory" })).toBeChecked();
    expect(screen.getByText(/Sticky: only the owner of a file/)).toBeInTheDocument();
  });

  it("reads a pasted chmod command into the mode, path, and -R switch", () => {
    render(<ChmodCalculator />);
    fireEvent.change(screen.getByLabelText("Octal"), { target: { value: "chmod -R 2775 /srv/shared" } });

    expect(screen.getByRole("status")).toHaveTextContent("Read as 2775.");
    expect(screen.getByLabelText("File or directory")).toHaveValue("/srv/shared");
    expect(screen.getByLabelText("Octal command")).toHaveTextContent("chmod -R 2775 /srv/shared");
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rwxrwsr-x");
  });

  it("applies each keystroke of an expression to the mode from before the expression", () => {
    render(<ChmodCalculator />);
    const octal = screen.getByLabelText("Octal");
    for (const value of ["a", "a+", "a+w", "a+", "a+r"]) fireEvent.change(octal, { target: { value } });
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rwxr-xr-x");

    fireEvent.change(octal, { target: { value: "a+w" } });
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rwxrwxrwx");
    fireEvent.change(octal, { target: { value: "640" } });
    fireEvent.change(octal, { target: { value: "u+x" } });
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rwxr-----");
  });

  it("shows errors for invalid input", () => {
    render(<ChmodCalculator />);
    fireEvent.change(screen.getByLabelText("Octal"), { target: { value: "758" } });
    expect(screen.getByRole("alert")).toHaveTextContent('"8" is not an octal digit');
    expect(screen.getByLabelText("Octal")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Symbolic"), { target: { value: "rwxr-x" } });
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent("This one has 6.");
  });

  it("previews and applies an expression, and X follows the directory switch", () => {
    render(<ChmodCalculator />);
    fireEvent.click(screen.getByRole("button", { name: /600/ }));
    fireEvent.change(screen.getByLabelText("Expression"), { target: { value: "go+rX" } });
    expect(screen.getByRole("status")).toHaveTextContent("600 (rw-------) becomes 644 (rw-r--r--).");

    fireEvent.click(screen.getByRole("switch", { name: "Directory" }));
    expect(screen.getByRole("status")).toHaveTextContent("becomes 655 (rw-r-xr-x)");

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByLabelText("Octal")).toHaveValue("655");
    expect(screen.getByLabelText("ls -l")).toHaveTextContent("drw-r-xr-x");
  });

  it("shows the default modes for a umask", () => {
    render(<ChmodCalculator />);
    fireEvent.change(screen.getByLabelText("umask"), { target: { value: "027" } });
    expect(screen.getByRole("list", { name: "Default modes" })).toHaveTextContent("New files640 (rw-r-----)New directories750 (rwxr-x---)");

    fireEvent.change(screen.getByLabelText("umask"), { target: { value: "09" } });
    expect(screen.getByRole("alert")).toHaveTextContent('"9" is not an octal digit');
  });
});
