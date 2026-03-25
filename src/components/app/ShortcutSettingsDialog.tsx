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

  useEffect(() => {
    if (!open || recordingActionId) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open, recordingActionId]);

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
        className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium">{action.label}</p>
          <p className="text-sm text-muted-foreground">{action.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[132px] rounded-md border bg-muted/40 px-3 py-2 text-center text-sm font-medium">
            {isRecording ? "Press keys..." : formatShortcutBinding(bindings[actionId], platform)}
          </div>
          <Button
            type="button"
            variant={isRecording ? "default" : "outline"}
            size="sm"
            aria-label={isRecording ? `Cancel recording for ${action.label}` : `Record ${action.label}`}
            onClick={() => {
              setRecordingActionId(isRecording ? null : actionId);
              setErrorMessage("");
            }}
          >
            {isRecording ? "Cancel" : "Record"}
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
      className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shortcut Settings"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#EB5757]">
              Keyboard Shortcuts
            </p>
            <h2 className="mt-1 text-xl font-semibold">Customize your shortcuts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Record a new shortcut, clear it, or restore defaults at any time.
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

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : recordingActionId ? (
            <div className="rounded-lg border border-[#EB5757]/30 bg-[#EB5757]/5 px-3 py-2 text-sm text-foreground">
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
            <div className="space-y-2">{GENERAL_ACTIONS.map((action) => renderActionRow(action.id))}</div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-medium">Favorites</h3>
              <p className="text-sm text-muted-foreground">
                Favorite shortcuts follow the current order in your favorites list.
              </p>
            </div>
            <div className="space-y-2">{FAVORITE_ACTIONS.map((action) => renderActionRow(action.id))}</div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={onResetDefaults}>
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
