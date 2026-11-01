import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
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
import {
  formatGlobalShortcut,
  getDefaultGlobalShortcut,
  globalShortcutFromEvent,
  type GlobalShortcut,
} from "@/utils/global-shortcut";
import { Switch } from "@/components/ui/switch";

export interface ShortcutSettingsPanelProps {
  platform: string | undefined;
  bindings: ShortcutBindings;
  onUpdateBinding: (actionId: ShortcutActionId, binding: ShortcutBinding | null) => void;
  onResetDefaults: () => void;
  /** The system-wide shortcut. Omitted in the browser preview, where it cannot work. */
  globalShortcut?: GlobalShortcut;
  globalShortcutError?: string | null;
  onChangeGlobalShortcut?: (shortcut: GlobalShortcut) => void;
}

const GENERAL_ACTIONS = SHORTCUT_ACTIONS.filter((action) => action.group === "general");
const FAVORITE_ACTIONS = SHORTCUT_ACTIONS.filter((action) => action.group === "favorites");

/** The Shortcuts section of Settings. Recording stops when the section unmounts. */
export function ShortcutSettingsPanel({
  platform,
  bindings,
  onUpdateBinding,
  onResetDefaults,
  globalShortcut,
  globalShortcutError,
  onChangeGlobalShortcut,
}: ShortcutSettingsPanelProps) {
  const [recordingActionId, setRecordingActionId] = useState<ShortcutActionId | null>(null);
  const [recordingGlobal, setRecordingGlobal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const defaultBindings = useMemo(() => getDefaultShortcutBindings(platform), [platform]);

  useEffect(() => {
    if (!recordingActionId) {
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
  }, [bindings, onUpdateBinding, platform, recordingActionId]);

  useEffect(() => {
    if (!recordingGlobal || !globalShortcut || !onChangeGlobalShortcut) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingGlobal(false);
        return;
      }
      const candidate = globalShortcutFromEvent(event);
      if (!candidate) return;
      onChangeGlobalShortcut(candidate);
      setRecordingGlobal(false);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [globalShortcut, onChangeGlobalShortcut, recordingGlobal]);

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
    <div className="space-y-6">
      <div className="settings-section-header">
        <div>
          <h3>Keyboard Shortcuts</h3>
          <p className="text-muted-foreground">Click a shortcut to record a new key combination.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onResetDefaults}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset All
        </Button>
      </div>

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

      {globalShortcut && onChangeGlobalShortcut ? (
        <section className="space-y-3">
          <div>
            <h4 className="font-medium">Anywhere on your computer</h4>
            <p className="text-sm text-muted-foreground">
              This shortcut works in every app while DevTools runs. It is paused while this section is open.
            </p>
          </div>
          <div className="shortcut-rows">
            <div className="shortcut-row">
              <div className="min-w-0 flex-1">
                <label className="font-medium" htmlFor="global-shortcut-enabled">Show DevTools</label>
                <p className="shortcut-description text-muted-foreground">
                  Opens DevTools with the command palette. Press it again to hide DevTools.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className="shortcut-recorder"
                  aria-pressed={recordingGlobal}
                  variant={recordingGlobal ? "default" : "outline"}
                  size="sm"
                  disabled={!globalShortcut.enabled}
                  aria-label={recordingGlobal ? "Cancel recording for Show DevTools" : "Record Show DevTools"}
                  onClick={() => setRecordingGlobal((value) => !value)}
                >
                  {recordingGlobal ? "Press keys…" : formatGlobalShortcut(globalShortcut, platform)}
                </Button>
                <Switch
                  id="global-shortcut-enabled"
                  checked={globalShortcut.enabled}
                  aria-label="Use the Show DevTools shortcut"
                  onCheckedChange={(enabled) => onChangeGlobalShortcut({ ...globalShortcut, enabled })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Reset Show DevTools"
                  onClick={() => onChangeGlobalShortcut(getDefaultGlobalShortcut(platform))}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>
          {recordingGlobal ? (
            <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Press a combination with Cmd, Ctrl, or {platform === "darwin" ? "Option" : "Alt"}. Press <strong>Esc</strong> to cancel.
            </div>
          ) : globalShortcutError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formatGlobalShortcut(globalShortcut, platform)} could not be registered. Another app may use it, or this desktop does not support global shortcuts. Choose a different combination.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h4 className="font-medium">General</h4>
          <p className="text-sm text-muted-foreground">
            Core app actions available from anywhere in the app.
          </p>
        </div>
        <div className="shortcut-rows">{GENERAL_ACTIONS.map((action) => renderActionRow(action.id))}</div>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="font-medium">Favorites</h4>
          <p className="text-sm text-muted-foreground">
            Favorite shortcuts follow the current order in your favorites list.
          </p>
        </div>
        <div className="shortcut-rows">{FAVORITE_ACTIONS.map((action) => renderActionRow(action.id))}</div>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="font-medium">Tabs</h4>
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
  );
}
