import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaporiLanguagePromptBlock,
  MUMBAI_SIGNATURE_EXPRESSIONS,
  MUMBAI_SLANG_VOCABULARY,
} from './taporiKnowledgeBase.ts';

describe('Tapori Semantic Knowledge Base', () => {
  it('contains all core supplied Mumbai slang terms with context, tone, usage, and examples', () => {
    const requiredTerms = [
      'Apun',
      'Tereko',
      'Mereko',
      'Dho daala',
      'Yede / Yedi',
      'Idharich',
      'Udharich',
      'Kopcha',
      'Kaaiku / Kayku',
      'Locha / Locha-labacha',
      'Machmach',
      'Badbad',
      'Jhakaas',
      'Dhasu',
      'Kadak',
      'Rapchik',
      'Mandwali',
      'Setting',
      'Topi',
      'Jholer',
      'Nalla',
      'Shaana',
      'Saala / Saali',
      'Shaanapanti / Shaanpatti',
      'Chidiya',
      'Ghoda',
      'Satak le',
      'Kat le',
      'Ghanta',
      'Tapori',
      'Maamu',
      'Sultana',
      'Fattu',
      'Maama / Pandu',
      'Lafda',
      'Chhaavi',
      'Item / Maal',
      'Chikna / Chikni',
      'Hadakna',
      'Bablya',
      'Sutta',
      'Waat lagna',
      'Dabba',
      'Saamaan',
      'Kaccha Limbu',
      'Lafda nahin karne ka',
      'Patli gali se satak le',
      'Hawa aane de',
      'Abe Saale',
      'Thakela',
      'Hari Patti',
      'Churan',
      'Taklya',
      'Peti',
      'Khoka',
      'Bhidu',
      'Sumdi mein',
      'Bol Bachchan',
      'Jhol',
      'Keeda',
      'Fund / Pant',
      'Re / Ray',
      'Bantai',
      'Cutting',
      'Ghungroo Salman',
      'Off ho gaya',
      'Tapak gaya',
      'Kharcha-paani',
    ];

    const termSet = new Set(MUMBAI_SLANG_VOCABULARY.map((e) => e.term));
    for (const term of requiredTerms) {
      assert.ok(termSet.has(term), `Missing slang term: ${term}`);
    }

    for (const entry of MUMBAI_SLANG_VOCABULARY) {
      assert.ok(entry.meaning.length > 0);
      assert.ok(entry.context.length > 0);
      assert.ok(entry.appropriateUsage.length > 0);
      assert.ok(entry.example.length > 0);
    }
  });

  it('includes all signature Mumbai expressions and toggles custom slang guidance accurately', () => {
    assert.ok(MUMBAI_SIGNATURE_EXPRESSIONS.includes('Kya bolta hai bhidu?'));
    assert.ok(MUMBAI_SIGNATURE_EXPRESSIONS.includes('Chauthi seat milega kya?'));
    assert.ok(MUMBAI_SIGNATURE_EXPRESSIONS.includes('Apun ka sunta-ich kidhar hai?'));

    const onBlock = buildTaporiLanguagePromptBlock(true);
    assert.match(onBlock, /Pick ONLY the term/i);

    const offBlock = buildTaporiLanguagePromptBlock(false);
    assert.match(offBlock, /Custom Slang Mode is currently turned OFF/i);
  });
});
