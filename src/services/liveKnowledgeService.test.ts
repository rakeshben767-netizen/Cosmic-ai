import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFocusedSearchQuery,
  checkKnowledgeRateLimit,
  clearKnowledgeCacheForTests,
  deduplicateAndScoreItems,
  getCacheTtlForCategory,
  inferKnowledgeCategoryFromQuery,
  normalizeKnowledgeCategory,
  parseGoogleNewsRss,
  searchLiveKnowledge,
} from './liveKnowledgeService.ts';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>India AI Mission expands GPU clusters across Mumbai and Pune - The Hindu</title>
      <link>https://www.thehindu.com/sci-tech/india-ai-gpu-mumbai</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <source url="https://www.thehindu.com">The Hindu</source>
      <description>India AI Mission announced expanded compute infrastructure for startups.</description>
    </item>
    <item>
      <title>India AI Mission expands GPU clusters across Mumbai and Pune - Indian Express</title>
      <link>https://indianexpress.com/article/technology/india-ai-gpu</link>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <source url="https://indianexpress.com">Indian Express</source>
      <description>Expanded compute cluster announced today.</description>
    </item>
  </channel>
</rss>`;

describe('liveKnowledgeService', () => {
  beforeEach(() => {
    clearKnowledgeCacheForTests();
  });

  it('normalizes categories across India, Maharashtra/Mumbai, Gold/Finance, Weather, AI, Memes, and Sports', () => {
    assert.equal(normalizeKnowledgeCategory('Mumbai news'), 'maharashtra-mumbai');
    assert.equal(normalizeKnowledgeCategory('Artificial Intelligence'), 'ai');
    assert.equal(normalizeKnowledgeCategory('viral meme'), 'memes');
    assert.equal(normalizeKnowledgeCategory('cricket'), 'sports');
    assert.equal(normalizeKnowledgeCategory('gold rate'), 'finance-prices');
    assert.equal(normalizeKnowledgeCategory('live weather'), 'weather');
    assert.equal(inferKnowledgeCategoryFromQuery('aaj gold price kitna hai', 'general'), 'finance-prices');
    assert.equal(inferKnowledgeCategoryFromQuery('IPL live score runs', undefined), 'sports');
    assert.equal(inferKnowledgeCategoryFromQuery('Mumbai ka mausam', 'general'), 'weather');
  });

  it('builds sharp queries and uses shorter 45s cache TTL for live prices, weather, and sports', () => {
    assert.match(buildFocusedSearchQuery('gold price', 'finance-prices'), /rate today India/i);
    assert.match(buildFocusedSearchQuery('IPL match', 'sports'), /live score scorecard/i);
    assert.match(buildFocusedSearchQuery('Mumbai', 'weather'), /live weather today/i);
    assert.equal(getCacheTtlForCategory('sports'), 45_000);
    assert.equal(getCacheTtlForCategory('weather'), 45_000);
    assert.equal(getCacheTtlForCategory('finance-prices'), 45_000);
    assert.equal(getCacheTtlForCategory('india'), 300_000);
  });

  it('parses RSS, removes near-duplicate headlines, boosts corroborated source count, and caches results', async () => {
    const parsed = parseGoogleNewsRss(SAMPLE_RSS, 'India AI Mumbai');
    assert.equal(parsed.length, 2);

    const deduped = deduplicateAndScoreItems(parsed);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].corroboratedBy, 2);

    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return deduped;
    };

    const first = await searchLiveKnowledge('India AI Mumbai', 'india', {
      fetchRssFn: mockFetch,
    });
    assert.equal(first.ok, true);
    assert.equal(first.offline, false);
    assert.equal(first.items.length, 1);
    assert.equal(first.sources[0].source, 'The Hindu');

    const second = await searchLiveKnowledge('India AI Mumbai', 'india', {
      fetchRssFn: mockFetch,
    });
    assert.equal(second.cached, true);
    assert.equal(fetchCount, 1);
  });

  it('reports offline honestly instead of fabricating news when sources fail', async () => {
    const res = await searchLiveKnowledge('latest breaking news', 'breaking', {
      fetchRssFn: async () => {
        throw new Error('Network unreachable');
      },
    });
    assert.equal(res.ok, false);
    assert.equal(res.offline, true);
    assert.equal(res.items.length, 0);
    assert.match(res.summary, /temporarily unavailable/i);
  });

  it('enforces per-client rate limiting', () => {
    const t = Date.now();
    for (let i = 0; i < 24; i++) {
      assert.equal(checkKnowledgeRateLimit('1.2.3.4', t + i), true);
    }
    assert.equal(checkKnowledgeRateLimit('1.2.3.4', t + 100), false);
  });
});
