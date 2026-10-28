/**
 * Unix file mode helpers for the chmod calculator. A mode is a number from 0 to 0o7777:
 * the 9 permission bits plus setuid (0o4000), setgid (0o2000), and sticky (0o1000).
 * Symbolic expressions follow GNU coreutils chmod.
 */

export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

export type Who = "u" | "g" | "o";
export type Perm = "r" | "w" | "x";

export const CLASSES: { who: Who; label: string; shift: number }[] = [
  { who: "u", label: "Owner", shift: 6 },
  { who: "g", label: "Group", shift: 3 },
  { who: "o", label: "Others", shift: 0 },
];

export const PERMS: { perm: Perm; label: string; bit: number }[] = [
  { perm: "r", label: "Read", bit: 4 },
  { perm: "w", label: "Write", bit: 2 },
  { perm: "x", label: "Execute", bit: 1 },
];

export const SPECIAL_BITS: { id: "setuid" | "setgid" | "sticky"; label: string; bit: number }[] = [
  { id: "setuid", label: "Setuid", bit: SETUID },
  { id: "setgid", label: "Setgid", bit: SETGID },
  { id: "sticky", label: "Sticky", bit: STICKY },
];

export const PRESETS: { mode: number; label: string }[] = [
  { mode: 0o644, label: "Normal file" },
  { mode: 0o755, label: "Program or directory" },
  { mode: 0o600, label: "Private file" },
  { mode: 0o700, label: "Private directory" },
  { mode: 0o775, label: "Group directory" },
  { mode: 0o1777, label: "Shared temp directory" },
  { mode: 0o400, label: "Read-only key" },
];

export type ModeResult = { ok: true; mode: number } | { ok: false; error: string };

/** The bit for one permission of one class, e.g. bitFor("g", "w") is 0o020. */
export const bitFor = (who: Who, perm: Perm) => {
  const shift = CLASSES.find((item) => item.who === who)!.shift;
  return PERMS.find((item) => item.perm === perm)!.bit << shift;
};

/** Reads an octal mode such as 755, 0755, 4755, or 0o755. Like chmod, short input fills from the right, so 7 is 0007. */
export function parseOctal(input: string): ModeResult {
  const text = input.trim().replace(/^0o/i, "");
  if (!text) return { ok: false, error: "Enter an octal mode, such as 755." };
  const bad = text.match(/[^0-7]/);
  if (bad) {
    return { ok: false, error: /[89]/.test(bad[0]) ? `Octal digits go from 0 to 7. "${bad[0]}" is not an octal digit.` : `"${bad[0]}" is not an octal digit. Use the digits 0 to 7.` };
  }
  const digits = text.replace(/^0+(?=.)/, "");
  if (digits.length > 4) return { ok: false, error: "An octal mode has at most 4 digits, such as 4755." };
  return { ok: true, mode: parseInt(digits, 8) };
}

/** Three digits, or four when a special bit is set. */
export const formatOctal = (mode: number) => mode.toString(8).padStart(mode > 0o777 ? 4 : 3, "0");

/** The 9-character string that `ls -l` shows after the file type, with s/S and t/T for the special bits. */
export function formatSymbolic(mode: number): string {
  let out = "";
  for (const { shift } of CLASSES) {
    const bits = (mode >> shift) & 7;
    out += bits & 4 ? "r" : "-";
    out += bits & 2 ? "w" : "-";
    const special = shift === 6 ? mode & SETUID : shift === 3 ? mode & SETGID : mode & STICKY;
    const exec = bits & 1;
    const letter = shift === 0 ? "t" : "s";
    out += special ? (exec ? letter : letter.toUpperCase()) : exec ? "x" : "-";
  }
  return out;
}

/** The full `ls -l` string, with "d" or "-" for the file type. */
export const formatLs = (mode: number, isDirectory: boolean) => `${isDirectory ? "d" : "-"}${formatSymbolic(mode)}`;

const FILE_TYPES: Record<string, string> = {
  "-": "file",
  d: "directory",
  l: "symbolic link",
  b: "block device",
  c: "character device",
  p: "named pipe",
  s: "socket",
};

export type SymbolicResult = { ok: true; mode: number; fileType?: string } | { ok: false; error: string };

/** Reads `rwxr-xr-x`, or the `ls -l` form with a file type first, such as `-rwsr-xr-x` or `drwxrwxrwt`. */
export function parseSymbolic(input: string): SymbolicResult {
  // ls adds "." for an SELinux context, "@" for extended attributes, and "+" for an ACL.
  let text = input.trim().replace(/(?<=^.{9,10})[.@+]$/, "");
  if (!text) return { ok: false, error: "Enter a symbolic mode, such as rwxr-xr-x." };
  let fileType: string | undefined;
  if (text.length === 10) {
    fileType = FILE_TYPES[text[0]];
    if (!fileType) return { ok: false, error: `"${text[0]}" is not a file type. Use -, d, l, b, c, p, or s.` };
    text = text.slice(1);
  }
  if (text.length !== 9) {
    return { ok: false, error: `A symbolic mode has 9 characters, or 10 with the file type first. This one has ${text.length}.` };
  }
  let mode = 0;
  for (let index = 0; index < 9; index++) {
    const char = text[index];
    const { shift, label } = CLASSES[Math.floor(index / 3)];
    const slot = index % 3;
    const allowed = slot === 0 ? "r-" : slot === 1 ? "w-" : shift === 0 ? "xtT-" : "xsS-";
    if (!allowed.includes(char)) {
      const options = allowed.split("").map((item) => `"${item}"`).join(", ");
      return { ok: false, error: `Character ${index + 1} ("${char}") is not valid. ${label} ${PERMS[slot].label.toLowerCase()} uses ${options}.` };
    }
    if (char === "r" || char === "w" || char === "x" || char === "s" || char === "t") mode |= PERMS[slot].bit << shift;
    if (char === "s" || char === "S") mode |= shift === 6 ? SETUID : SETGID;
    if (char === "t" || char === "T") mode |= STICKY;
  }
  return { ok: true, mode, fileType };
}

/** The `u=...,g=...,o=...` form that sets every bit. */
export function formatAssignment(mode: number): string {
  return CLASSES.map(({ who, shift }) => {
    const bits = (mode >> shift) & 7;
    let perms = (bits & 4 ? "r" : "") + (bits & 2 ? "w" : "") + (bits & 1 ? "x" : "");
    if (who === "u" && mode & SETUID) perms += "s";
    if (who === "g" && mode & SETGID) perms += "s";
    if (who === "o" && mode & STICKY) perms += "t";
    return `${who}=${perms}`;
  }).join(",");
}

/** The bits each class owns, including its special bit. */
const CLASS_MASK: Record<Who, number> = { u: SETUID | 0o700, g: SETGID | 0o070, o: STICKY | 0o007 };

/**
 * Applies a symbolic chmod expression, such as `u+x`, `go-w`, `a=r`, or `u=rwx,g=rx,o=`.
 * With no class letter (`+x`), real chmod skips the bits that the umask blocks. This tool has
 * no umask, so it treats a missing class as `a`. `X` adds execute only for a directory or for a
 * mode that already has an execute bit.
 */
export function applyExpression(mode: number, input: string, isDirectory: boolean): ModeResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "Enter an expression, such as u+x or go-w." };
  let result = mode;
  for (const clause of text.split(",")) {
    const match = clause.match(/^([ugoa]*)([-+=].*)$/);
    if (!match) {
      return { ok: false, error: `"${clause}" is not valid. Start each part with u, g, o, or a, then +, -, or =.` };
    }
    const whoText = match[1].includes("a") || !match[1] ? "ugo" : match[1];
    const affected = [...whoText].reduce((mask, who) => mask | CLASS_MASK[who as Who], 0);
    for (const action of match[2].match(/[-+=][^-+=]*/g) ?? []) {
      const op = action[0];
      const letters = action.slice(1);
      let value = 0;
      if (/^[ugo]$/.test(letters)) {
        // Copy the permissions of one class, as in g=u.
        const source = CLASSES.find((item) => item.who === letters)!;
        value = ((result >> source.shift) & 7) * 0o111;
      } else {
        for (const letter of letters) {
          if (letter === "r") value |= 0o444;
          else if (letter === "w") value |= 0o222;
          else if (letter === "x") value |= 0o111;
          else if (letter === "X") value |= isDirectory || result & 0o111 ? 0o111 : 0;
          else if (letter === "s") value |= SETUID | SETGID;
          else if (letter === "t") value |= STICKY;
          else return { ok: false, error: `"${letter}" in "${clause}" is not a permission. Use r, w, x, X, s, or t, or one of u, g, or o to copy.` };
        }
      }
      value &= affected;
      if (op === "+") result |= value;
      else if (op === "-") result &= ~value;
      else result = (result & ~affected) | value;
    }
  }
  return { ok: true, mode: result };
}

export type ModeInput =
  | { ok: true; mode: number; kind: "octal" | "symbolic" | "expression"; fileType?: string; path?: string; recursive?: boolean }
  | { ok: false; error: string };

/** GNU chmod long options that do not change the mode. --recursive also sets -R. */
const LONG_OPTIONS = ["--recursive", "--verbose", "--changes", "--silent", "--quiet", "--no-preserve-root", "--preserve-root"];

/**
 * Reads any mode text a user can paste: an octal mode, a symbolic or `ls -l` string,
 * or a whole command such as `chmod -R 755 dir`. A symbolic expression in a command applies to `current`.
 */
export function parseModeInput(input: string, current: number, isDirectory: boolean): ModeInput {
  const text = input.trim();
  const command = text.match(/^(?:sudo\s+)?chmod\s+(.*)$/);
  if (command) {
    const words = command[1].split(/\s+/).filter(Boolean);
    let recursive = false;
    // Short flags can combine, as in -Rv. A mode such as -w also starts with "-", so only known flag letters count.
    while (words[0] && (/^-[RvcfHLPh]+$/.test(words[0]) || words[0].startsWith("--"))) {
      const flag = words.shift()!;
      if (flag === "--") break;
      if (flag.startsWith("--reference")) return { ok: false, error: "--reference copies the mode of another file. This tool cannot read files, so enter the mode instead." };
      if (flag.startsWith("--") && !LONG_OPTIONS.includes(flag)) return { ok: false, error: `The chmod option ${flag} is not supported.` };
      if (flag === "--recursive" || /^-[^-]*R/.test(flag)) recursive = true;
    }
    const [modeText, ...paths] = words;
    if (!modeText) return { ok: false, error: "The chmod command has no mode. Add one, such as chmod 755 file." };
    const path = paths.join(" ") || undefined;
    if (/^\d+$/.test(modeText)) {
      const octal = parseOctal(modeText);
      return "error" in octal ? octal : { ok: true, mode: octal.mode, kind: "octal", path, recursive };
    }
    const applied = applyExpression(current, modeText, isDirectory);
    return "error" in applied ? applied : { ok: true, mode: applied.mode, kind: "expression", path, recursive };
  }
  if (/^(0o)?\d+$/i.test(text)) {
    const octal = parseOctal(text);
    return "error" in octal ? octal : { ok: true, mode: octal.mode, kind: "octal" };
  }
  const symbolicLike = /^[-dlbcps]?[rwxsStT-]+[.@+]?$/.test(text);
  if (symbolicLike && text.length >= 9) {
    const symbolic = parseSymbolic(text);
    return "error" in symbolic ? symbolic : { ok: true, mode: symbolic.mode, kind: "symbolic", fileType: symbolic.fileType };
  }
  if (/^[ugoa]*[-+=]/.test(text)) {
    const applied = applyExpression(current, text, isDirectory);
    return "error" in applied ? applied : { ok: true, mode: applied.mode, kind: "expression" };
  }
  if (symbolicLike) {
    // Too short for a symbolic mode, so parseSymbolic returns the length error.
    const symbolic = parseSymbolic(text);
    if ("error" in symbolic) return symbolic;
  }
  const octal = parseOctal(text);
  return "error" in octal ? octal : { ok: true, mode: octal.mode, kind: "octal" };
}

/** Puts a path in single quotes when the shell would split or expand it. */
export const quotePath = (path: string) => (/^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replace(/'/g, `'\\''`)}'`);

export function chmodCommands(mode: number, path: string, recursive: boolean) {
  const target = quotePath(path.trim() || "file");
  const flag = recursive ? "-R " : "";
  return {
    octal: `chmod ${flag}${formatOctal(mode)} ${target}`,
    symbolic: `chmod ${flag}${formatAssignment(mode)} ${target}`,
  };
}

/** "read", "read and run", "read, write, and run". */
const joinWords = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? "") : words.length === 2 ? `${words[0]} and ${words[1]}` : `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;

const SUBJECT: Record<Who, string> = { u: "Owner", g: "Group", o: "Others" };

/** Plain-English sentences for a mode, one per class, then one per special bit. */
export function explainMode(mode: number, isDirectory: boolean): string[] {
  const verbs = isDirectory ? ["list the files", "add, remove, and rename files", "enter"] : ["read", "write", "run"];
  const sentences = CLASSES.map(({ who, shift }) => {
    const bits = (mode >> shift) & 7;
    const words = PERMS.filter((perm) => bits & perm.bit).map((perm) => verbs[PERMS.indexOf(perm)]);
    return words.length ? `${SUBJECT[who]} can ${joinWords(words)}.` : `${SUBJECT[who]} has no access.`;
  });
  if (isDirectory && (mode & 0o111) !== 0o111) {
    const blocked = CLASSES.filter(({ shift }) => ((mode >> shift) & 5) === 4).map(({ who }) => SUBJECT[who].toLowerCase());
    if (blocked.length) sentences.push(`Without execute, ${joinWords(blocked)} can see the file names but cannot open the files.`);
  }
  if (mode & SETUID) {
    sentences.push(isDirectory ? "Setuid has no effect on a directory on most systems." : "Setuid: the program runs as the owner of the file, not as the user who starts it.");
    if (!(mode & 0o100) && !isDirectory) sentences.push("Setuid has no effect here, because the owner cannot run the file (ls shows a capital S).");
  }
  if (mode & SETGID) {
    sentences.push(isDirectory ? "Setgid: new files in the directory get the group of the directory." : "Setgid: the program runs with the group of the file.");
    if (!(mode & 0o010) && !isDirectory) sentences.push("The group cannot run the file, so setgid means mandatory locking on some systems (ls shows a capital S).");
  }
  if (mode & STICKY) {
    sentences.push(
      isDirectory
        ? "Sticky: only the owner of a file, the owner of the directory, or root can delete or rename files in it."
        : "Sticky: modern systems ignore this bit on files.",
    );
  }
  return sentences;
}

/** Reads a umask such as 022 or 0027. */
export function parseUmask(input: string): ModeResult {
  const result = parseOctal(input);
  if ("error" in result) return { ok: false, error: result.error.replace("an octal mode, such as 755", "a umask, such as 022") };
  if (result.mode > 0o777) return { ok: false, error: "A umask uses only the permission bits. Use 3 digits, such as 022." };
  return result;
}

/** The modes that new files (666) and new directories (777) get under a umask. */
export const umaskDefaults = (umask: number) => ({ file: 0o666 & ~umask, directory: 0o777 & ~umask });
