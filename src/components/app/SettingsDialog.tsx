import { useDialogFocus } from "./useDialogFocus";
import type { ReactNode } from "react";
import { Bug, Coffee, Download, Github, Heart, Info, Keyboard, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ShortcutSettingsPanel, type ShortcutSettingsPanelProps } from "./ShortcutSettingsPanel";
import { GUMROAD_URL, ISSUES_URL, PATREON_URL, REPOSITORY_URL } from "@/data/support";
import type { ThemePreference } from "@/utils/theme";

export type SettingsSection = "general" | "updates" | "shortcuts" | "about";

export interface GeneralSettings {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  sidebarOnLaunch: boolean;
  onSidebarOnLaunchChange: (open: boolean) => void;
  pasteSuggestions: boolean;
  onPasteSuggestionsChange: (enabled: boolean) => void;
  recentCount: number;
  favoriteCount: number;
  onClearRecents: () => void;
  onClearFavorites: () => void;
}

export interface UpdateSettings {
  status: string;
  actionLabel: string;
  actionDisabled: boolean;
  onAction: () => void;
  autoUpdate: boolean;
  onAutoUpdateChange: (enabled: boolean) => void;
  unsupported: boolean;
}

interface SettingsDialogProps {
  /** The open section, or null when Settings is closed. */
  section: SettingsSection | null;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  appVersion: string;
  general: GeneralSettings;
  /** Omitted in the browser preview, which cannot update itself. */
  updates?: UpdateSettings;
  shortcuts: ShortcutSettingsPanelProps;
  onOpenReleaseNotes?: () => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function SettingsRow({ label, description, htmlFor, children }: { label: string; description?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        {htmlFor ? <label className="font-medium" htmlFor={htmlFor}>{label}</label> : <p className="font-medium">{label}</p>}
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  section,
  onSectionChange,
  onClose,
  appVersion,
  general,
  updates,
  shortcuts,
  onOpenReleaseNotes,
}: SettingsDialogProps) {
  const open = section !== null;
  const dialogRef = useDialogFocus(open, onClose);

  if (!section) {
    return null;
  }

  const sections: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
    { id: "general", label: "General", icon: SlidersHorizontal },
    ...(updates ? [{ id: "updates" as const, label: "Updates", icon: Download }] : []),
    { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
    { id: "about", label: "About", icon: Info },
  ];

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
        aria-label="Settings"
        className="modal-surface settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? "page" : undefined}
                onClick={() => onSectionChange(id)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="modal-body settings-body">
            {section === "general" && (
              <div className="space-y-6">
                <section>
                  <h3>Appearance</h3>
                  <SettingsRow label="Theme" description="System follows the appearance of your computer.">
                    <div className="settings-segmented" role="radiogroup" aria-label="Theme">
                      {THEME_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={general.themePreference === option.value}
                          onClick={() => general.onThemePreferenceChange(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </SettingsRow>
                  <SettingsRow label="Show the sidebar at launch" description="Turn this off to start with more room for tools." htmlFor="settings-sidebar-on-launch">
                    <Switch id="settings-sidebar-on-launch" checked={general.sidebarOnLaunch} onCheckedChange={general.onSidebarOnLaunchChange} />
                  </SettingsRow>
                </section>

                <section>
                  <h3>Paste</h3>
                  <SettingsRow label="Suggest a tool when I paste" description="Paste a JWT, JSON, a URL, or other text outside a text field to see matching tools." htmlFor="settings-paste-suggestions">
                    <Switch id="settings-paste-suggestions" checked={general.pasteSuggestions} onCheckedChange={general.onPasteSuggestionsChange} />
                  </SettingsRow>
                </section>

                <section>
                  <h3>Data</h3>
                  <SettingsRow label="Recent tools" description={`${general.recentCount} saved on this computer.`}>
                    <Button type="button" variant="outline" size="sm" onClick={general.onClearRecents} disabled={general.recentCount === 0}>
                      Clear recent tools
                    </Button>
                  </SettingsRow>
                  <SettingsRow label="Favorites" description={`${general.favoriteCount} saved on this computer.`}>
                    <Button type="button" variant="outline" size="sm" onClick={general.onClearFavorites} disabled={general.favoriteCount === 0}>
                      Clear favorites
                    </Button>
                  </SettingsRow>
                </section>
              </div>
            )}

            {section === "updates" && updates && (
              <section>
                <h3>Updates</h3>
                <SettingsRow label={`DevTools v${appVersion}`} description={updates.status || "You have the latest version."}>
                  <Button type="button" variant="outline" size="sm" onClick={updates.onAction} disabled={updates.actionDisabled}>
                    {updates.actionLabel}
                  </Button>
                </SettingsRow>
                {!updates.unsupported && (
                  <SettingsRow
                    label="Update automatically"
                    description="Download updates in the background and install them when you quit DevTools."
                    htmlFor="auto-update"
                  >
                    <Switch id="auto-update" checked={updates.autoUpdate} onCheckedChange={updates.onAutoUpdateChange} />
                  </SettingsRow>
                )}
                {onOpenReleaseNotes && (
                  <SettingsRow label="Release notes" description="See what changed in this version.">
                    <Button type="button" variant="ghost" size="sm" onClick={onOpenReleaseNotes}>
                      What's New
                    </Button>
                  </SettingsRow>
                )}
              </section>
            )}

            {section === "shortcuts" && <ShortcutSettingsPanel {...shortcuts} />}

            {section === "about" && (
              <div className="space-y-6">
                <div className="settings-about">
                  <img src="./brand/mark.svg" alt="" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">DevTools</p>
                    <p className="text-muted-foreground">{appVersion ? `Version ${appVersion}` : "Browser preview"} · Free and open source under the MIT license.</p>
                  </div>
                </div>

                <section className="settings-support" aria-labelledby="settings-support-title">
                  <Heart size={18} aria-hidden="true" className="settings-support-icon" />
                  <div className="min-w-0 flex-1">
                    <h3 id="settings-support-title">Support DevTools</h3>
                    <p className="text-muted-foreground">
                      DevTools is free and open source. If it saves you time, you can support its development.
                    </p>
                    <div className="settings-support-actions">
                      <a href={GUMROAD_URL} target="_blank" rel="noreferrer" className="settings-link-button is-primary">
                        <Coffee size={14} aria-hidden="true" />
                        Buy me a coffee
                      </a>
                      <a href={PATREON_URL} target="_blank" rel="noreferrer" className="settings-link-button">
                        <Heart size={14} aria-hidden="true" />
                        Become a member on Patreon
                      </a>
                    </div>
                  </div>
                </section>

                <section>
                  <h3>Links</h3>
                  <div className="settings-links">
                    <a href={REPOSITORY_URL} target="_blank" rel="noreferrer"><Github size={15} aria-hidden="true" />Source code on GitHub</a>
                    <a href={ISSUES_URL} target="_blank" rel="noreferrer"><Bug size={15} aria-hidden="true" />Report an issue</a>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer flex justify-end">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
