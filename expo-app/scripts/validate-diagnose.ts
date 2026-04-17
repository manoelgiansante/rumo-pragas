/**
 * Validate Rumo Pragas diagnose edge function against known pest/disease images.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *   npx tsx scripts/validate-diagnose.ts
 *
 * Scoring: crop +1 | pest +2 | confidence>=0.5 +1  (max 4 per image)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL/ANON_KEY');
  process.exit(1);
}
if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  console.error('Missing TEST_USER_EMAIL/PASSWORD');
  process.exit(1);
}

interface TestCase {
  label: string;
  imageUrl: string; // base file URL (without thumb)
  expectedCropKeywords: string[];
  expectedPestKeywords: string[];
  cropType: string;
}

// Use Wikipedia's thumb endpoint to cap at 1280px wide -> always under 7.5MB.
function thumbUrl(originalUrl: string, width = 1280): string {
  // Convert /commons/X/YY/Filename.jpg -> /commons/thumb/X/YY/Filename.jpg/{width}px-Filename.jpg
  const m = originalUrl.match(/\/commons\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/);
  if (!m) return originalUrl;
  const [, a, b, file] = m;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${b}/${file}/${width}px-${file}`;
}

const TEST_CASES: TestCase[] = [
  {
    label: 'Lagarta da soja (Anticarsia gemmatalis)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/c/c3/Anticarsia_gemmatalis_%2845090719022%29.jpg',
    expectedCropKeywords: ['soja', 'soybean', 'outro', ''],
    expectedPestKeywords: ['anticarsia', 'lagarta', 'velvetbean', 'gemmatalis'],
    cropType: 'Soybean',
  },
  {
    label: 'Lagarta da soja (eggs/Anticarsia)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/9/94/Velvetbean_caterpillar%2C_eggs_2014-06-06-14.48.01_ZS_PMax_%2815753693807%29.jpg',
    expectedCropKeywords: ['soja', 'soybean', 'outro', 'ovo', 'egg', ''],
    expectedPestKeywords: ['anticarsia', 'lagarta', 'velvetbean', 'ovo', 'egg'],
    cropType: 'Soybean',
  },
  {
    label: 'Lagarta do cartucho em milho (Spodoptera frugiperda)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/9/91/Zea_mays_damaged_by_Spodoptera_frugiperda_%28200218-0814%29.jpg',
    expectedCropKeywords: ['milho', 'corn', 'maize', 'zea'],
    expectedPestKeywords: ['spodoptera', 'frugiperda', 'cartucho', 'armyworm', 'lagarta'],
    cropType: 'Corn',
  },
  {
    label: 'Lagarta do cartucho no colmo',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/a/a6/Spodoptera_frugiperda_in_stalk_of_Zea_mays.jpg',
    expectedCropKeywords: ['milho', 'corn', 'maize'],
    expectedPestKeywords: ['spodoptera', 'frugiperda', 'cartucho', 'armyworm', 'lagarta'],
    cropType: 'Corn',
  },
  {
    label: 'Ferrugem do cafe (folhas em fazenda)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/2/23/Coffee_leaves_with_rust_at_Fairview_Estate%2C_Kiambu%2C_KE.jpg',
    expectedCropKeywords: ['cafe', 'coffee'],
    expectedPestKeywords: ['ferrugem', 'hemileia', 'vastatrix', 'rust'],
    cropType: 'Coffee',
  },
  {
    label: 'Ferrugem do cafe (defoliation)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/9/94/Coffee-leaf-rust-defoliation.jpg',
    expectedCropKeywords: ['cafe', 'coffee'],
    expectedPestKeywords: ['ferrugem', 'hemileia', 'vastatrix', 'rust'],
    cropType: 'Coffee',
  },
  {
    label: 'Ferrugem do cafe (close-up Hemileia)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/3/3e/Hemileia_vastatrix_-_coffee_leaf_rust.jpg',
    expectedCropKeywords: ['cafe', 'coffee'],
    expectedPestKeywords: ['ferrugem', 'hemileia', 'vastatrix', 'rust'],
    cropType: 'Coffee',
  },
  {
    label: 'Percevejo verde (Nezara viridula)',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Nezara_viridula_MHNT_verte.jpg',
    expectedCropKeywords: ['soja', 'soybean', 'outro', ''],
    expectedPestKeywords: ['percevejo', 'nezara', 'viridula', 'stink', 'bug'],
    cropType: 'Soybean',
  },
  {
    label: 'Percevejo verde (portrait)',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/7/7c/Nezara_viridula_MHNT_portrait.jpg',
    expectedCropKeywords: ['soja', 'soybean', 'outro', ''],
    expectedPestKeywords: ['percevejo', 'nezara', 'viridula', 'stink', 'bug'],
    cropType: 'Soybean',
  },
  {
    label: 'Mancha alvo (Corynespora cassiicola) em pepino',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/d/d8/Cucumis_sativus_-_Corynespora_cassiicola-1-Hinrichs-Berger.jpg',
    expectedCropKeywords: ['pepino', 'cucumber', 'cucumis', 'outro', ''],
    expectedPestKeywords: ['mancha', 'alvo', 'corynespora', 'cassiicola', 'target', 'spot'],
    cropType: '',
  },
];

// Strip Portuguese accents so "café" matches "cafe"
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function fetchImageAsBase64WithCap(
  url: string,
): Promise<{ base64: string; sourceUrl: string; sizeBytes: number }> {
  const candidates = [thumbUrl(url, 1280), thumbUrl(url, 1024), thumbUrl(url, 800), url];
  let lastErr: Error | null = null;
  for (const u of candidates) {
    try {
      const res = await fetch(u, {
        headers: { 'User-Agent': 'RumoPragas-Validator/1.0 (admin@agrorumo.com)' },
      });
      if (!res.ok) {
        lastErr = new Error(`${res.status} ${res.statusText}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // Base64 length = ceil(N/3)*4. We cap source at 7MB raw -> ~9.3MB base64 (under 10MB limit)
      if (buf.length > 7_000_000) {
        lastErr = new Error(`too large ${buf.length}`);
        continue;
      }
      return { base64: buf.toString('base64'), sourceUrl: u, sizeBytes: buf.length };
    } catch (e) {
      lastErr = e as Error;
      continue;
    }
  }
  throw new Error(`all variants failed: ${lastErr?.message}`);
}

function scoreResult(test: TestCase, result: Record<string, unknown> | null) {
  const reasons: string[] = [];
  let points = 0;
  const max = 4;
  if (!result) {
    reasons.push('null');
    return { points, max, reasons };
  }

  const notes = (result.parsedNotes as Record<string, unknown> | undefined) ?? {};
  const pestId = normalize(String(result.pest_id ?? ''));
  const pestName = normalize(String(result.pest_name ?? ''));
  const crop = normalize(String(notes.crop ?? (result as Record<string, unknown>).crop ?? ''));
  const confidence = Number(result.confidence ?? 0);

  const cropHit =
    test.expectedCropKeywords.includes('') ||
    test.expectedCropKeywords.some((kw) => kw && crop.includes(normalize(kw)));
  if (cropHit) {
    points += 1;
    reasons.push(`crop ok (${crop || 'empty'})`);
  } else reasons.push(`crop miss (got ${crop || 'empty'})`);

  const pestHay = `${pestId} ${pestName}`;
  const pestHit = test.expectedPestKeywords.some((kw) => pestHay.includes(normalize(kw)));
  if (pestHit) {
    points += 2;
    reasons.push(`pest ok (${pestName})`);
  } else reasons.push(`pest miss (${pestName} | ${pestId})`);

  if (confidence >= 0.5) {
    points += 1;
    reasons.push(`conf ok (${confidence.toFixed(2)})`);
  } else reasons.push(`conf low (${confidence.toFixed(2)})`);

  return { points, max, reasons };
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  console.log('1. Authenticating test user...');
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL!,
    password: TEST_USER_PASSWORD!,
  });
  if (authErr || !auth?.session) {
    console.error('Auth failed:', authErr?.message);
    process.exit(1);
  }
  const token = auth.session.access_token;
  console.log(`   OK (user: ${auth.user?.id})\n`);

  const functionUrl = `${SUPABASE_URL}/functions/v1/diagnose`;
  let totalPoints = 0;
  let totalMax = 0;
  let correct = 0;

  const results: Array<{
    test: string;
    points: number;
    max: number;
    reasons: string[];
    raw: unknown;
    sourceUrl?: string;
  }> = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test = TEST_CASES[i];
    console.log(`\n[${i + 1}/${TEST_CASES.length}] ${test.label}`);

    let sourceUrl = test.imageUrl;
    try {
      const fetched = await fetchImageAsBase64WithCap(test.imageUrl);
      sourceUrl = fetched.sourceUrl;
      console.log(`   img: ${sourceUrl}`);
      console.log(`   size: ${(fetched.sizeBytes / 1_048_576).toFixed(2)} MB raw`);

      const body = {
        image_base64: fetched.base64,
        crop_type: test.cropType,
        latitude: -15.78,
        longitude: -47.93,
      };

      const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.log(`   HTTP ${res.status}: ${txt.slice(0, 300)}`);
        totalMax += 4;
        results.push({
          test: test.label,
          points: 0,
          max: 4,
          reasons: [`http ${res.status}: ${txt.slice(0, 200)}`],
          raw: txt,
          sourceUrl,
        });
        continue;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const { points, max, reasons } = scoreResult(test, data);
      totalPoints += points;
      totalMax += max;
      if (reasons.some((r) => r.startsWith('pest ok'))) correct++;

      console.log(`   score: ${points}/${max}`);
      console.log(`   reasons: ${reasons.join(' | ')}`);
      results.push({ test: test.label, points, max, reasons, raw: data, sourceUrl });
    } catch (e) {
      console.log(`   ERR: ${(e as Error).message}`);
      totalMax += 4;
      results.push({
        test: test.label,
        points: 0,
        max: 4,
        reasons: [`exception: ${(e as Error).message}`],
        raw: null,
        sourceUrl,
      });
    }

    // Respect rate limit (5/min per user)
    if (i < TEST_CASES.length - 1 && (i + 1) % 4 === 0) {
      console.log('   ...sleeping 65s for rate limit...');
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }

  const accuracy = totalMax > 0 ? (totalPoints / totalMax) * 100 : 0;
  const strictAccuracy = TEST_CASES.length > 0 ? (correct / TEST_CASES.length) * 100 : 0;

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tests:             ${TEST_CASES.length}`);
  console.log(`Weighted score:    ${totalPoints}/${totalMax} (${accuracy.toFixed(1)}%)`);
  console.log(`Strict pest match: ${correct}/${TEST_CASES.length} (${strictAccuracy.toFixed(1)}%)`);

  if (strictAccuracy < 70) {
    console.log('\n[!] Below 70% strict. Suggestions:');
    console.log('  1. Add Brazilian-specific few-shot examples to SYSTEM_PROMPT');
    console.log('  2. Include more pest synonyms (pt-BR + scientific) in lookup');
    console.log('  3. Upgrade vision model from claude-haiku-4-5 to claude-sonnet-4-5');
    console.log("  4. Add 'leaf morphology then whole plant' chain-of-thought");
    console.log('  5. Return top-3 predictions with confidence spread');
  }

  const report = {
    run_at: new Date().toISOString(),
    total_tests: TEST_CASES.length,
    weighted_points: totalPoints,
    weighted_max: totalMax,
    weighted_accuracy_pct: accuracy,
    strict_correct: correct,
    strict_accuracy_pct: strictAccuracy,
    results,
  };

  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.resolve(process.cwd(), 'scripts/validate-diagnose-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  process.exit(strictAccuracy >= 70 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
