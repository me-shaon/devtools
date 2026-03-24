export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
export const THEME_STORAGE_KEY = "devtools-theme-preference";

export type ThemePreference = "system" | "light" | "dark";

type MatchMediaFn = (query: string) => Pick<MediaQueryList, "matches">;

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

export const getSystemDarkMode = (matchMedia?: MatchMediaFn | null): boolean => {
  if (typeof matchMedia !== "function") {
    return false;
  }

  return matchMedia(SYSTEM_THEME_QUERY).matches;
};

export const getStoredThemePreference = (
  storage?: Pick<Storage, "getItem"> | null,
): ThemePreference => {
  if (!storage) {
    return "system";
  }

  try {
    const storedPreference = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedPreference) ? storedPreference : "system";
  } catch {
    return "system";
  }
};

export const resolveDarkMode = (
  preference: ThemePreference,
  systemDarkMode: boolean,
): boolean => {
  if (preference === "system") {
    return systemDarkMode;
  }

  return preference === "dark";
};

export const syncDarkClass = (
  root: Pick<HTMLElement, "classList"> | null | undefined,
  enabled: boolean,
): void => {
  root?.classList.toggle("dark", enabled);
};
