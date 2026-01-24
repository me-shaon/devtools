/**
 * Password utility functions for generating passwords and passphrases
 */

export interface PasswordOptions {
  length?: number;
  includeLowercase?: boolean;
  includeUppercase?: boolean;
  includeNumbers?: boolean;
  includeSymbols?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PassphraseOptions {
  wordCount?: number;
  capitalize?: boolean;
  includeNumbers?: boolean;
  separator?: string;
}

export interface PasswordStrength {
  score: number;
  strength: string;
  entropy: number;
  feedback: string[];
}

// Character sets
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
const AMBIGUOUS = "0OIl1";

// Word list for passphrases (common, easy to remember words)
const WORD_LIST = [
  "correct", "horse", "battery", "staple", "apple", "banana", "cherry", "dragon",
  "elephant", "flower", "garden", "house", "island", "jungle", "kingdom", "lemon",
  "mountain", "nature", "ocean", "piano", "quiet", "river", "sunshine", "tiger",
  "umbrella", "violet", "window", "yellow", "zebra", "bridge", "castle", "desert",
  "eagle", "forest", "guitar", "harbor", "insight", "journey", "kindness", "lighthouse",
  "moment", "noble", "oasis", "paradise", "question", "reflection", "star", "travel",
  "universe", "victory", "wisdom", "adventure", "butterfly", "crystal", "diamond",
  "emerald", "freedom", "gratitude", "harmony", "inspiration", "journey", "kindred",
  "luminous", "marvelous", "serenity", "tranquil", "wonder", "yearning", "blossom",
  "cascade", "dazzle", "ephemeral", "flourish", "glisten", "horizon", "infinite",
];

/**
 * Generate a random password
 */
export function generatePassword(options: PasswordOptions = {}): string {
  const {
    length = 12,
    includeLowercase = true,
    includeUppercase = true,
    includeNumbers = true,
    includeSymbols = false,
    excludeAmbiguous = false,
  } = options;

  let charset = "";
  if (includeLowercase) charset += LOWERCASE;
  if (includeUppercase) charset += UPPERCASE;
  if (includeNumbers) charset += NUMBERS;
  if (includeSymbols) charset += SYMBOLS;

  if (!charset) {
    throw new Error("At least one character set must be selected");
  }

  if (excludeAmbiguous) {
    charset = charset.split("").filter(c => !AMBIGUOUS.includes(c)).join("");
  }

  let password = "";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }

  return password;
}

/**
 * Generate multiple passwords
 */
export function generateMultiplePasswords(count: number, options: PasswordOptions = {}): string[] {
  const passwords: string[] = [];
  for (let i = 0; i < count; i++) {
    passwords.push(generatePassword(options));
  }
  return passwords;
}

/**
 * Calculate password strength
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  // Length score
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Character variety
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (hasLower) score++;
  if (hasUpper && hasLower) score++;
  if (hasNumber) score++;
  if (hasSymbol) score++;

  // Calculate entropy (rough estimate)
  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasNumber) charsetSize += 10;
  if (hasSymbol) charsetSize += 30;

  const entropy = password.length * Math.log2(charsetSize || 1);

  // Generate feedback
  if (password.length < 8) feedback.push("Use at least 8 characters");
  if (!hasLower || !hasUpper) feedback.push("Mix uppercase and lowercase");
  if (!hasNumber) feedback.push("Add numbers");
  if (!hasSymbol) feedback.push("Add symbols");
  if (feedback.length === 0) feedback.push("Password is strong!");

  // Determine strength label
  let strength = "Very Weak";
  if (score >= 8) strength = "Strong";
  else if (score >= 6) strength = "Good";
  else if (score >= 4) strength = "Fair";
  else if (score >= 2) strength = "Weak";

  return { score, strength, entropy, feedback };
}

/**
 * Generate a memorable passphrase
 */
export function generatePassphrase(options: PassphraseOptions = {}): string {
  const {
    wordCount = 4,
    capitalize = false,
    includeNumbers = false,
    separator = "-",
  } = options;

  const words: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    let word = WORD_LIST[randomIndex];

    if (capitalize) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }

    if (includeNumbers && i === wordCount - 1) {
      const randomNum = Math.floor(Math.random() * 100);
      word += randomNum;
    }

    words.push(word);
  }

  return words.join(separator);
}
