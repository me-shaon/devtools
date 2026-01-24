/**
 * Lorem Ipsum generator utility functions
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

export interface LoremOptions {
  count?: number;
  type?: "words" | "sentences" | "paragraphs";
  startWithLorem?: boolean;
}

/**
 * Get a random word from the word list
 */
function getRandomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/**
 * Generate specified number of words
 */
export function generateWords(count: number, startWithLorem = false): string {
  const result: string[] = [];

  if (startWithLorem && count > 0) {
    result.push("Lorem", "ipsum");
    for (let i = 2; i < count; i++) {
      result.push(getRandomWord());
    }
  } else {
    for (let i = 0; i < count; i++) {
      result.push(getRandomWord());
    }
  }

  return result.join(" ");
}

/**
 * Generate specified number of sentences
 */
export function generateSentences(count: number, startWithLorem = false): string {
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const wordCount = Math.floor(Math.random() * 10) + 5;
    const sentence = generateWords(wordCount, startWithLorem && i === 0);
    result.push(sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".");
  }

  return result.join(" ");
}

/**
 * Generate specified number of paragraphs
 */
export function generateParagraphs(count: number, startWithLorem = true): string {
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const sentenceCount = Math.floor(Math.random() * 4) + 4;
    const paragraph = generateSentences(sentenceCount, startWithLorem && i === 0);
    result.push(paragraph);
  }

  return result.join("\n\n");
}

/**
 * Generate Lorem Ipsum text
 */
export function generateLorem(options: LoremOptions = {}): string {
  const { count = 3, type = "paragraphs", startWithLorem = true } = options;

  switch (type) {
    case "words":
      return generateWords(count, startWithLorem);
    case "sentences":
      return generateSentences(count, startWithLorem);
    case "paragraphs":
      return generateParagraphs(count, startWithLorem);
  }
}
