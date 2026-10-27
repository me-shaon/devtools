import { useDialogFocus } from "./useDialogFocus";
import { useEffect, useMemo, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SHORTCUT_ACTIONS,
  bindingFromKeyboardEvent,
  formatShortcutBinding,
  getShortcutActionDefinition,
  getShortcutConflict,
  getDefaultShortcutBindings,
  isReservedShortcut,
  type ShortcutActionId,
  type ShortcutBinding,
  type ShortcutBindings,
} from "@/utils/shortcuts";

interface ShortcutSettingsDialogProps {
  open: boolean;
  platform: string | undefined;
  bindings: ShortcutBindings;
  onClose: () => void;
  onUpdateBinding: (actionId: ShortcutActionId, binding: ShortcutBinding | null) => void;
  onResetDefaults: () => void;
}

const GENERAL_ACTIONS = SHORTCUT_ACTIONS.filter((action) => action.group === "general");
const FAVORITE_ACTIONS = SHORTCUT_ACTIONS.filter((action) => action.group === "favorites");

export function ShortcutSettingsDialog({
  open,
  platform,
  bindings,
  onClose,
  onUpdateBinding,
  onResetDefaults,
}: ShortcutSettingsDialogProps) {
  const [recordingActionId, setRecordingActionId] = useState<ShortcutActionId | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useDialogFocus(open, onClose);
  const defaultBindings = useMemo(() => getDefaultShortcutBindings(platform), [platform]);

  useEffect(() => {
    if (!open || !recordingActionId) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingActionId(null);
        setErrorMessage("");
        return;
      }

      const candidateBinding = bindingFromKeyboardEvent(event);
      if (!candidateBinding) {
        return;
      }

      if (isReservedShortcut(candidateBinding, platform)) {
        setErrorMessage("That shortcut is reserved by the app or operating system.");
        return;
      }

      const conflictingActionId = getShortcutConflict(bindings, candidateBinding, recordingActionId);
      if (conflictingActionId) {
        setErrorMessage(
          `That shortcut is already assigned to ${getShortcutActionDefinition(conflictingActionId).label}.`,
        );
        return;
      }

      onUpdateBinding(recordingActionId, candidateBinding);
      setRecordingActionId(null);
      setErrorMessage("");
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [bindings, onUpdateBinding, open, platform, recordingActionId]);

  useEffect(() => {
    if (!open) {
      setRecordingActionId(null);
      setErrorMessage("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const renderActionRow = (actionId: ShortcutActionId) => {
    const action = getShortcutActionDefinition(actionId);
    const isRecording = recordingActionId === actionId;
    const hasDefault = defaultBindings[actionId] !== null;

    return (
      <div
        key={action.id}
        className="shortcut-row"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">{action.label}</p>
          <p className="shortcut-description text-muted-foreground">{action.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="shortcut-recorder"
            aria-pressed={isRecording}
            variant={isRecording ? "default" : "outline"}
            size="sm"
            aria-label={isRecording ? `Cancel recording for ${action.label}` : `Record ${action.label}`}
            onClick={() => {
              setRecordingActionId(isRecording ? null : actionId);
              setErrorMessage("");
            }}
          >
            {isRecording ? "Press keys…" : formatShortcutBinding(bindings[actionId], platform)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Clear ${action.label}`}
            onClick={() => onUpdateBinding(actionId, null)}
            disabled={bindings[actionId] === null}
          >
            Clear
          </Button>
          {hasDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Reset ${action.label}`}
              onClick={() => onUpdateBinding(actionId, defaultBindings[actionId])}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shortcut Settings"
        className="modal-surface shortcut-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Click a shortcut to record a new key combination.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close shortcut settings"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-body min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {errorMessage ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : recordingActionId ? (
            <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Recording for {getShortcutActionDefinition(recordingActionId).label}. Press{" "}
              <strong>Esc</strong> to cancel.
            </div>
          ) : null}

          <section className="space-y-3">
            <div>
              <h3 className="font-medium">General</h3>
              <p className="text-sm text-muted-foreground">
                Core app actions available from anywhere in the app.
              </p>
            </div>
            <div className="shortcut-rows">{GENERAL_ACTIONS.map((action) => renderActionRow(action.id))}</div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-medium">Favorites</h3>
              <p className="text-sm text-muted-foreground">
                Favorite shortcuts follow the current order in your favorites list.
              </p>
            </div>
            <div className="shortcut-rows">{FAVORITE_ACTIONS.map((action) => renderActionRow(action.id))}</div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-medium">Tabs</h3>
              <p className="text-sm text-muted-foreground">
                These shortcuts are fixed. They work when a tool tab is open.
              </p>
            </div>
            <div className="shortcut-rows">
              {[
                ["Close tab", "Close the tool you are using.", `${platform === "darwin" ? "⌘" : "Ctrl+"}W`],
                ["Next tab", "Move to the next open tool.", "Ctrl+Tab"],
                ["Previous tab", "Move to the previous open tool.", "Ctrl+Shift+Tab"],
                ["Move between tabs", "Use when a tab has focus. Delete closes it.", "← → Home End"],
              ].map(([label, description, keys]) => (
                <div key={label} className="shortcut-row">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="shortcut-description text-muted-foreground">{description}</p>
                  </div>
                  <kbd className="shortcut-fixed">{keys}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="modal-footer flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onResetDefaults}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset All Defaults
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
