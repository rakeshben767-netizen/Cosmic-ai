import type { GoogleGenAI } from '@google/genai';
import type { LiveKnowledgeItem, LiveKnowledgeSearchResult } from '../types/cosmic.ts';

export const KNOWLEDGE_CATEGORIES = [
  'breaking',
  'india',
  'maharashtra-mumbai',
  'international',
  'technology',
  'ai',
  'gaming',
  'mobile',
  'social-trends',
  'memes',
  'entertainment',
  'sports',
  'pop-culture',
  'slang',
  'general',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

interface CacheEntry {
  expiresAt: number;
  result: LiveKnowledgeSearchResult;
}

interface RateBucket {
  timestamps: number[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 24;
const SEARCH_TIMEOUT_MS = 7500;

const knowledgeCache = new Map<string, CacheEntry>();
const rateLimitBuckets = new Map<string, RateBucket>();

export function clearKnowledgeCacheForTests(): void {
  knowledgeCache.clear();
  rateLimitBuckets.clear();
}

export function checkKnowledgeRateLimit(clientKey: string, now = Date.now()): boolean {
  const key = clientKey.trim() || 'anonymous';
  const bucket = rateLimitBuckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (bucket.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  rateLimitBuckets.set(key, bucket);
  return true;
}

export function normalizeKnowledgeCategory(raw?: string): KnowledgeCategory {
  if (!raw || typeof raw !== 'string') return 'general';
  const cleaned = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const direct = KNOWLEDGE_CATEGORIES.find((c) => c === cleaned);
  if (direct) return direct;

  if (/mumbai|maharashtra|pune|marathi/.test(cleaned)) return 'maharashtra-mumbai';
  if (/india|bharat|national/.test(cleaned)) return 'india';
  if (/ai|artificial|llm|gemini|openai/.test(cleaned)) return 'ai';
  if (/tech|software|hardware/.test(cleaned)) return 'technology';
  if (/game|gaming|esports/.test(cleaned)) return 'gaming';
  if (/android|mobile|phone|smartphone/.test(cleaned)) return 'mobile';
  if (/meme|viral/.test(cleaned)) return 'memes';
  if (/trend|social/.test(cleaned)) return 'social-trends';
  if (/movie|series|music|hip-?hop|bollywood|entertain/.test(cleaned)) return 'entertainment';
  if (/sport|cricket|ipl|football/.test(cleaned)) return 'sports';
  if (/slang|lingo|expression/.test(cleaned)) return 'slang';
  if (/world|global|international/.test(cleaned)) return 'international';
  if (/break|latest|today/.test(cleaned)) return 'breaking';
  return 'general';
}

export function buildFocusedSearchQuery(rawQuery: string, category: KnowledgeCategory): string {
  const clean = rawQuery
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);

  if (!clean) {
    if (category === 'maharashtra-mumbai') return 'Mumbai Maharashtra latest news today';
    if (category === 'india') return 'India top news today';
    if (category === 'ai') return 'latest artificial intelligence news today';
    if (category === 'technology') return 'latest technology news today';
    if (category === 'memes') return 'trending internet memes India today';
    return 'top trending news India world today';
  }

  const lower = clean.toLowerCase();
  if (category === 'maharashtra-mumbai' && !/mumbai|maharashtra/.test(lower)) {
    return `${clean} Mumbai Maharashtra`;
  }
  if (category === 'india' && !/india|indian/.test(lower)) {
    return `${clean} India`;
  }
  if (category === 'ai' && !/\bai\b|artificial intelligence/.test(lower)) {
    return `${clean} artificial intelligence`;
  }
  return clean;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDateLabel(isoOrRaw: string | null): string {
  if (!isoOrRaw) return 'Date unverified';
  const parsed = new Date(isoOrRaw);
  if (Number.isNaN(parsed.getTime())) return 'Date unverified';
  return parsed.toISOString().slice(0, 10);
}

export function parseGoogleNewsRss(xml: string, query: string): LiveKnowledgeItem[] {
  const items: LiveKnowledgeItem[] = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  const queryTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  const nowMs = Date.now();

  for (const block of itemMatches.slice(0, 16)) {
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
    const rawLink = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '';
    const rawPubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '';
    const rawSource = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || '';
    const rawDesc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';

    let headline = decodeHtmlEntities(rawTitle);
    let source = decodeHtmlEntities(rawSource) || 'News Publisher';
    const url = decodeHtmlEntities(rawLink);
    const snippet = decodeHtmlEntities(rawDesc);

    // Google News RSS titles often end with " - Publisher Name"
    const dashIdx = headline.lastIndexOf(' - ');
    if (dashIdx > 12 && (!rawSource || headline.slice(dashIdx + 3).length <= 45)) {
      if (!rawSource) {
        source = headline.slice(dashIdx + 3).trim();
      }
      headline = headline.slice(0, dashIdx).trim();
    }

    if (!headline || !url || !/^https?:\/\//i.test(url)) continue;

    const parsedDate = rawPubDate ? new Date(rawPubDate.trim()) : null;
    const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
    const ageDays = validDate ? Math.max(0, (nowMs - validDate.getTime()) / (1000 * 60 * 60 * 24)) : 14;

    const haystack = `${headline} ${snippet}`.toLowerCase();
    let tokenHits = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) tokenHits++;
    }
    const overlapScore = queryTokens.length > 0 ? tokenHits / queryTokens.length : 0.4;
    const freshnessBoost = ageDays <= 1 ? 0.55 : ageDays <= 3 ? 0.42 : ageDays <= 7 ? 0.25 : 0.08;
    const relevanceScore = Number(Math.min(1, overlapScore * 0.65 + freshnessBoost).toFixed(2));

    items.push({
      headline,
      source,
      url,
      publishedAt: validDate ? validDate.toISOString() : null,
      dateLabel: validDate ? validDate.toISOString().slice(0, 10) : 'Recent',
      snippet: snippet && snippet !== headline ? snippet.slice(0, 220) : headline,
      relevanceScore,
      corroboratedBy: 1,
    });
  }

  return items;
}

export function deduplicateAndScoreItems(items: LiveKnowledgeItem[]): LiveKnowledgeItem[] {
  const seenUrls = new Set<string>();
  const normalizedList: LiveKnowledgeItem[] = [];

  for (const item of items) {
    const cleanUrl = item.url.trim().toLowerCase().replace(/\/+$/, '');
    const normTitle = item.headline
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normTitle || seenUrls.has(cleanUrl)) continue;

    const wordsA = new Set(normTitle.split(' ').filter((w) => w.length > 2));
    let duplicateOfExisting: LiveKnowledgeItem | null = null;
    for (const existing of normalizedList) {
      const existingNorm = existing.headline
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (existingNorm === normTitle) {
        duplicateOfExisting = existing;
        break;
      }
      const wordsB = new Set(existingNorm.split(' ').filter((w) => w.length > 2));
      if (wordsA.size > 0 && wordsB.size > 0) {
        let overlap = 0;
        for (const w of wordsA) if (wordsB.has(w)) overlap++;
        const ratio = overlap / Math.min(wordsA.size, wordsB.size);
        if (ratio >= 0.72) {
          duplicateOfExisting = existing;
          break;
        }
      }
    }

    if (duplicateOfExisting) {
      if (item.source !== duplicateOfExisting.source) {
        duplicateOfExisting.corroboratedBy += 1;
        duplicateOfExisting.relevanceScore = Number(
          Math.min(1, duplicateOfExisting.relevanceScore + 0.08).toFixed(2),
        );
      }
      continue;
    }

    seenUrls.add(cleanUrl);
    normalizedList.push({ ...item });
  }

  return normalizedList.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return b.corroboratedBy - a.corroboratedBy;
  });
}

async function fetchGoogleNewsFeed(
  focusedQuery: string,
  signal: AbortSignal,
): Promise<LiveKnowledgeItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    focusedQuery,
  )}&hl=en-IN&gl=IN&ceid=IN:en`;

  const response = await fetch(url, {
    signal,
    headers: {
      'User-Agent': 'CosmicAI-LiveKnowledge/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });
  if (!response.ok) {
    throw new Error(`News feed HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseGoogleNewsRss(xml, focusedQuery);
}

async function fetchGeminiGroundedSearch(
  ai: GoogleGenAI,
  focusedQuery: string,
  category: KnowledgeCategory,
  signal: AbortSignal,
): Promise<{
  summaryText: string;
  groundedItems: LiveKnowledgeItem[];
} | null> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Today is ${todayIso}. Search live web sources for accurate, up-to-date information on: "${focusedQuery}" (category: ${category}).
Provide a brief, strictly factual 2-4 sentence summary highlighting key dates, source names, and verified facts. Never invent facts if recent data is missing.`,
    config: {
      tools: [{ googleSearch: {} }],
      abortSignal: signal,
    },
  });

  const summaryText = (response.text || '').trim();
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundedItems: LiveKnowledgeItem[] = [];

  for (const chunk of chunks) {
    const web = chunk?.web;
    if (web?.uri && /^https?:\/\//i.test(web.uri)) {
      let hostSource = 'Web Source';
      try {
        hostSource = new URL(web.uri).hostname.replace(/^www\./, '');
      } catch {
        // ignore
      }
      groundedItems.push({
        headline: (web.title || hostSource).trim(),
        source: hostSource,
        url: web.uri,
        publishedAt: new Date().toISOString(),
        dateLabel: todayIso,
        snippet: summaryText.slice(0, 200) || (web.title || hostSource),
        relevanceScore: 0.88,
        corroboratedBy: 1,
      });
    }
  }

  return { summaryText, groundedItems };
}

export interface SearchLiveKnowledgeDeps {
  ai?: GoogleGenAI | null;
  fetchRssFn?: (query: string, signal: AbortSignal) => Promise<LiveKnowledgeItem[]>;
}

export async function searchLiveKnowledge(
  rawQuery: string,
  rawCategory?: string,
  deps: SearchLiveKnowledgeDeps = {},
): Promise<LiveKnowledgeSearchResult> {
  const category = normalizeKnowledgeCategory(rawCategory);
  const focusedQuery = buildFocusedSearchQuery(rawQuery, category);
  const cacheKey = `${category}::${focusedQuery.toLowerCase()}`;
  const now = Date.now();

  const cached = knowledgeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.result, cached: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  const rssLoader = deps.fetchRssFn ?? fetchGoogleNewsFeed;
  const collectedItems: LiveKnowledgeItem[] = [];
  let groundedSummary = '';
  const errors: string[] = [];

  try {
    const tasks: Array<Promise<void>> = [
      rssLoader(focusedQuery, controller.signal)
        .then((items) => {
          collectedItems.push(...items);
        })
        .catch((err) => {
          errors.push(`RSS: ${err instanceof Error ? err.message : String(err)}`);
        }),
    ];

    if (deps.ai) {
      tasks.push(
        fetchGeminiGroundedSearch(deps.ai, focusedQuery, category, controller.signal)
          .then((res) => {
            if (res) {
              if (res.summaryText) groundedSummary = res.summaryText;
              collectedItems.push(...res.groundedItems);
            }
          })
          .catch((err) => {
            errors.push(`SearchGrounding: ${err instanceof Error ? err.message : String(err)}`);
          }),
      );
    }

    await Promise.all(tasks);
  } finally {
    clearTimeout(timer);
  }

  const deduped = deduplicateAndScoreItems(collectedItems).slice(0, 6);
  const fetchedAt = new Date().toISOString();

  if (deduped.length === 0 && !groundedSummary) {
    const isNetworkOrTimeout = errors.length > 0;
    return {
      ok: false,
      query: focusedQuery,
      category,
      fetchedAt,
      offline: isNetworkOrTimeout,
      summary:
        'Live information is temporarily unavailable right now because trusted search sources could not be reached.',
      items: [],
      sources: [],
      error: errors.join(' | ') || 'No recent verified results found.',
    };
  }

  const fallbackSummary =
    deduped.length > 0
      ? deduped
          .slice(0, 3)
          .map((item) => `[${item.dateLabel}] ${item.headline} (${item.source})`)
          .join(' | ')
      : groundedSummary;

  const combinedSummary =
    deduped.length > 0 && groundedSummary && !groundedSummary.includes(deduped[0].headline.slice(0, 20))
      ? `${fallbackSummary} — Context: ${groundedSummary}`
      : fallbackSummary || groundedSummary;

  const result: LiveKnowledgeSearchResult = {
    ok: true,
    query: focusedQuery,
    category,
    fetchedAt,
    offline: false,
    cached: false,
    summary: combinedSummary,
    items: deduped,
    sources: deduped.map((item) => ({
      title: item.headline,
      url: item.url,
      source: item.source,
      dateLabel: item.dateLabel,
    })),
  };

  if (knowledgeCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = knowledgeCache.keys().next().value;
    if (oldestKey) knowledgeCache.delete(oldestKey);
  }
  knowledgeCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, result });

  return result;
}
