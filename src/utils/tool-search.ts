export interface SearchableTool {
  id: string;
  name: string;
  category: string;
}

function scoreTextMatch(text: string, query: string): number {
  if (!query) {
    return 0;
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedText === normalizedQuery) {
    return 1000;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 700 - (normalizedText.length - normalizedQuery.length);
  }

  const wordIndex = normalizedText.indexOf(` ${normalizedQuery}`);
  if (wordIndex !== -1) {
    return 550 - wordIndex;
  }

  const substringIndex = normalizedText.indexOf(normalizedQuery);
  if (substringIndex !== -1) {
    return 400 - substringIndex;
  }

  let currentIndex = 0;
  let gapPenalty = 0;

  for (const character of normalizedQuery) {
    const foundIndex = normalizedText.indexOf(character, currentIndex);
    if (foundIndex === -1) {
      return Number.NEGATIVE_INFINITY;
    }

    gapPenalty += foundIndex - currentIndex;
    currentIndex = foundIndex + 1;
  }

  return 250 - gapPenalty - Math.max(0, normalizedText.length - normalizedQuery.length);
}

export function searchTools<T extends SearchableTool>(tools: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [...tools];
  }

  return [...tools]
    .map((tool) => {
      const nameScore = scoreTextMatch(tool.name, normalizedQuery);
      const categoryScore = scoreTextMatch(tool.category, normalizedQuery) * 0.6;
      const combinedScore = Math.max(nameScore, categoryScore);

      return { tool, combinedScore, nameScore };
    })
    .filter((entry) => Number.isFinite(entry.combinedScore))
    .sort((left, right) => {
      if (right.combinedScore !== left.combinedScore) {
        return right.combinedScore - left.combinedScore;
      }

      if (right.nameScore !== left.nameScore) {
        return right.nameScore - left.nameScore;
      }

      return left.tool.name.localeCompare(right.tool.name);
    })
    .map((entry) => entry.tool);
}
