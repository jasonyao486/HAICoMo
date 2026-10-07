import type { Family } from "./domain";

/** Corporate marks are separate from model/product portraits and client identities. */
export const FAMILY_COMPANY: Record<Family, { id: string; name: string }> = {
  chatgpt: { id: "openai", name: "OpenAI" }, claude: { id: "anthropic", name: "Anthropic" },
  gemini: { id: "google", name: "Google" }, deepseek: { id: "deepseek", name: "DeepSeek" },
  grok: { id: "xai", name: "xAI" }, kimi: { id: "moonshot", name: "Moonshot AI" },
  glm: { id: "zai", name: "Z.ai" }, minimax: { id: "minimax", name: "MiniMax" },
  mistral: { id: "mistral", name: "Mistral AI" }, qwen: { id: "alibaba", name: "Alibaba" },
  llama: { id: "meta", name: "Meta" }, seedance: { id: "bytedance", name: "ByteDance" },
  ernie: { id: "baidu", name: "Baidu" }, perplexity: { id: "perplexity", name: "Perplexity" },
};
export function assignedCompanies(assignees: string[]) {
  const result = new Map<string, { id: string; name: string }>();
  for (const actor of assignees) {
    const company = FAMILY_COMPANY[actor as Family];
    if (company) result.set(company.id, company);
  }
  return [...result.values()];
}
