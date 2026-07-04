import { findOfficialWebsite, normalizeUrl } from "./serper";

export type Resolved = {
  name: string;        // best-known company name
  website?: string;    // official website if determined
  sources: string[];
  knowledgePhone?: string;
  knowledgeAddress?: string;
};

const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;

export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/\s/.test(s) && !/^https?:\/\//i.test(s)) return false;
  return URL_RE.test(s);
}

function nameFromHost(website: string): string {
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    const core = host.split(".")[0];
    return core.charAt(0).toUpperCase() + core.slice(1);
  } catch {
    return website;
  }
}

// Turn raw user input (name OR url) into a resolved target.
// If serperKey is absent and input is a name, we cannot resolve a site —
// caller degrades gracefully.
export async function resolveTarget(
  input: string,
  serperKey?: string,
): Promise<Resolved> {
  const trimmed = input.trim();

  if (looksLikeUrl(trimmed)) {
    const website = normalizeUrl(trimmed);
    return { name: nameFromHost(website), website, sources: [website] };
  }

  // It's a company name.
  if (!serperKey) {
    return { name: trimmed, sources: [] };
  }

  const { website, knowledge, sources } = await findOfficialWebsite(trimmed, serperKey);
  return {
    name: knowledge?.title || trimmed,
    website,
    sources,
    knowledgePhone: knowledge?.phone,
    knowledgeAddress: knowledge?.address,
  };
}
