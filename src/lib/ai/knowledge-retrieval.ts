import type { AiKnowledgeEntry } from "@/types/ai-agent";

/**
 * Recuperación simple de conocimiento (sin embeddings).
 * Diseñada para sustituirse después por búsqueda vectorial.
 */
export function rankKnowledgeEntries(
  entries: AiKnowledgeEntry[],
  query: string,
  limit = 6,
): AiKnowledgeEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return entries.slice(0, limit);
  }

  const scored = entries.map((entry) => {
    const haystack = `${entry.title}\n${entry.content}\n${entry.category}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += entry.title.toLowerCase().includes(token) ? 3 : 1;
      }
    }
    return { entry, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9áéíóúñü]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

export function formatKnowledgeForPrompt(entries: AiKnowledgeEntry[]): string {
  if (entries.length === 0) {
    return "(Sin entradas de conocimiento relevantes.)";
  }

  return entries
    .map(
      (entry, index) =>
        `[${index + 1}] ${entry.title} (${entry.category})\n${entry.content}`,
    )
    .join("\n\n");
}
