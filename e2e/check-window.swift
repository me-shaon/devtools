// Exits 0 when the process with the given PID has an on-screen window.
// Usage: swift e2e/check-window.swift <pid>
import CoreGraphics
import Foundation

guard CommandLine.arguments.count > 1, let pid = Int(CommandLine.arguments[1]) else {
    fputs("Usage: swift e2e/check-window.swift <pid>\n", stderr)
    exit(2)
}

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
let appWindows = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid }
let bounds = appWindows.compactMap { $0[kCGWindowBounds as String] as? [String: Any] }

print("Windows for PID \(pid): \(bounds)")
exit(appWindows.isEmpty ? 1 : 0)
