/**
 * Lorem Ipsum and fake data generator utility functions
 */

const WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum",
];

const FIRST_NAMES = [
  "Aaliyah", "Adam", "Aisha", "Alex", "Amara", "Ana", "Arjun", "Ava", "Ben", "Camila",
  "Carlos", "Chen", "Chloe", "Daniel", "David", "Diego", "Elena", "Emma", "Ethan", "Fatima",
  "Grace", "Hana", "Hugo", "Isabel", "Ivan", "Jack", "James", "Jin", "Julia", "Kai",
  "Leila", "Liam", "Lucas", "Maya", "Mei", "Mia", "Noah", "Nora", "Olivia", "Omar",
  "Priya", "Rafael", "Ravi", "Rosa", "Sam", "Sara", "Sofia", "Tariq", "Yuki", "Zoe",
];

const LAST_NAMES = [
  "Ahmed", "Ali", "Anderson", "Brown", "Chen", "Clark", "Costa", "Davis", "Diaz", "Evans",
  "Fischer", "Garcia", "Green", "Hall", "Hassan", "Hill", "Ito", "Jones", "Kim", "Khan",
  "Lee", "Lopez", "Martin", "Meyer", "Miller", "Moore", "Nguyen", "Novak", "Okafor", "Park",
  "Patel", "Perez", "Rossi", "Santos", "Schmidt", "Silva", "Singh", "Smith", "Suzuki", "Tanaka",
  "Taylor", "Thomas", "Walker", "Wang", "White", "Wilson", "Wong", "Young", "Yilmaz", "Zhang",
];

// Reserved by RFC 2606 for examples, so generated emails and URLs never reach a real site or inbox.
const DOMAINS = ["example.com", "example.org", "example.net"];

export const MAX_COUNT = 1000;

export type LoremKind = "paragraphs" | "sentences" | "words" | "titles" | "names" | "emails" | "urls";
export type LoremFormat = "text" | "json";

/** A source of numbers in [0, 1). Tests pass a seeded one. */
export type RandomSource = () => number;

export interface LoremOptions {
  count?: number;
  type?: LoremKind;
  startWithLorem?: boolean;
  random?: RandomSource;
}

const pick = <T>(list: readonly T[], random: RandomSource): T => list[Math.floor(random() * list.length)];
const between = (min: number, max: number, random: RandomSource) => min + Math.floor(random() * (max - min + 1));
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const clampCount = (count: number) => Math.min(Math.max(Math.floor(count) || 1, 1), MAX_COUNT);

const wordList = (count: number, startWithLorem: boolean, random: RandomSource): string[] => {
  const result: string[] = [];
  for (let i = 0; i < count; i++) result.push(pick(WORDS, random));
  if (startWithLorem) result.splice(0, 2, "Lorem", "ipsum");
  return result.slice(0, count);
};

const sentence = (startWithLorem: boolean, random: RandomSource) => {
  const text = wordList(between(5, 14, random), startWithLorem, random).join(" ");
  return capitalize(text) + ".";
};

const paragraph = (startWithLorem: boolean, random: RandomSource) =>
  Array.from({ length: between(4, 7, random) }, (_, i) => sentence(startWithLorem && i === 0, random)).join(" ");

const title = (random: RandomSource) => wordList(between(3, 7, random), false, random).map(capitalize).join(" ");

const fullName = (random: RandomSource) => `${pick(FIRST_NAMES, random)} ${pick(LAST_NAMES, random)}`;

// first.last@domain, with a number added when the address is already in the batch,
// so a list can seed a column with a unique constraint.
const emails = (count: number, random: RandomSource): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  while (result.length < count) {
    const local = fullName(random).toLowerCase().replace(" ", ".");
    const domain = pick(DOMAINS, random);
    let email = `${local}@${domain}`;
    for (let n = 2; seen.has(email); n++) email = `${local}${n}@${domain}`;
    seen.add(email);
    result.push(email);
  }
  return result;
};

const url = (random: RandomSource) => {
  const host = (random() < 0.5 ? "www." : "") + pick(DOMAINS, random);
  const segments = Array.from({ length: between(1, 3, random) }, () => wordList(between(1, 3, random), false, random).join("-"));
  return `https://${host}/${segments.join("/")}`;
};

/** Generate a list of items of one kind. The count is clamped to 1 to MAX_COUNT. */
export function generateItems(
  kind: LoremKind,
  count: number,
  { startWithLorem = false, random = Math.random }: { startWithLorem?: boolean; random?: RandomSource } = {},
): string[] {
  const total = clampCount(count);
  const each = (make: (i: number) => string) => Array.from({ length: total }, (_, i) => make(i));
  switch (kind) {
    case "words":
      return wordList(total, startWithLorem, random);
    case "sentences":
      return each((i) => sentence(startWithLorem && i === 0, random));
    case "paragraphs":
      return each((i) => paragraph(startWithLorem && i === 0, random));
    case "titles":
      return each(() => title(random));
    case "names":
      return each(() => fullName(random));
    case "emails":
      return emails(total, random);
    case "urls":
      return each(() => url(random));
  }
}

/**
 * Join items for output. Text reads naturally: paragraphs are split by a blank line,
 * sentences and words by a space, and fake data is one item per line. JSON is an array of strings.
 */
export function formatItems(items: string[], kind: LoremKind, format: LoremFormat): string {
  if (format === "json") return JSON.stringify(items, null, 2);
  switch (kind) {
    case "paragraphs":
      return items.join("\n\n");
    case "sentences":
    case "words":
      return items.join(" ");
    default:
      return items.join("\n");
  }
}

/**
 * Generate specified number of words
 */
export function generateWords(count: number, startWithLorem = false, random: RandomSource = Math.random): string {
  return formatItems(generateItems("words", count, { startWithLorem, random }), "words", "text");
}

/**
 * Generate specified number of sentences
 */
export function generateSentences(count: number, startWithLorem = false, random: RandomSource = Math.random): string {
  return formatItems(generateItems("sentences", count, { startWithLorem, random }), "sentences", "text");
}

/**
 * Generate specified number of paragraphs
 */
export function generateParagraphs(count: number, startWithLorem = true, random: RandomSource = Math.random): string {
  return formatItems(generateItems("paragraphs", count, { startWithLorem, random }), "paragraphs", "text");
}

/**
 * Generate Lorem Ipsum text
 */
export function generateLorem(options: LoremOptions = {}): string {
  const { count = 3, type = "paragraphs", startWithLorem = true, random = Math.random } = options;
  return formatItems(generateItems(type, count, { startWithLorem, random }), type, "text");
}
