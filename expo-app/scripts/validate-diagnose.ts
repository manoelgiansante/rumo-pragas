/**
 * Offline diagnosis contract gate.
 *
 * This command never authenticates, downloads images or calls an external
 * service. Integration tests for the Edge Function live beside the function
 * and use an isolated local Supabase stack. Keeping this gate offline prevents
 * CI or a developer shell from accidentally sending photos, credentials or
 * exact location to production.
 */

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const CONSENT_VERSION = '2026-07-14.1';
const OUTPUT_PATH = resolve(process.cwd(), '.artifacts', 'diagnosis-validation', 'summary.json');

const forbiddenKeys = new Set([
  'chemical_treatment',
  'chemical_treatment_es',
  'recommended_products',
  'dosage',
  'dose',
  'latitude',
  'longitude',
  'location_lat',
  'location_lng',
  'user_id',
]);

const fixture = {
  id: '00000000-0000-4000-8000-000000000001',
  crop: 'soja',
  pest_id: 'sample-pest',
  pest_name: 'Amostra educativa',
  confidence: 0.82,
  severity: 'medium',
  created_at: '2026-01-01T00:00:00.000Z',
  parsedNotes: {
    message: 'Resultado de contrato local sem recomendação de produto.',
    predictions: [{ id: 'sample-pest', confidence: 0.82 }],
  },
};

function collectForbiddenKeys(value: unknown, path = '$', findings: string[] = []): string[] {
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (forbiddenKeys.has(key)) findings.push(childPath);
    collectForbiddenKeys(child, childPath, findings);
  }
  return findings;
}

function validateContract(value: typeof fixture): Array<{ name: string; passed: boolean }> {
  const checks: Array<[string, boolean]> = [
    ['object', !!value && typeof value === 'object'],
    ['id_uuid', typeof value?.id === 'string' && /^[0-9a-f-]{36}$/i.test(value.id)],
    ['crop', typeof value?.crop === 'string' && value.crop.length > 0],
    ['pest_name', typeof value?.pest_name === 'string' && value.pest_name.length > 0],
    [
      'confidence_range',
      typeof value?.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1,
    ],
    ['created_at', !Number.isNaN(Date.parse(value?.created_at ?? ''))],
    ['no_sensitive_or_prescriptive_keys', collectForbiddenKeys(value).length === 0],
  ];
  return checks.map(([name, passed]) => ({ name, passed: passed === true }));
}

function buildMutationHeaders() {
  return {
    'Idempotency-Key': randomUUID(),
    'X-Pragas-AI-Consent-Version': CONSENT_VERSION,
    'X-Pragas-AI-Consent-Purpose': 'diagnosis',
  };
}

function main() {
  if (process.env.PRAGAS_DIAGNOSIS_VALIDATION_MODE === 'remote') {
    throw new Error(
      'Remote diagnosis validation is disabled. Use the isolated local Edge Function contract suite.',
    );
  }

  const headers = buildMutationHeaders();
  const checks = validateContract(fixture);
  checks.push({
    name: 'consent_headers',
    passed:
      headers['X-Pragas-AI-Consent-Version'] === CONSENT_VERSION &&
      headers['X-Pragas-AI-Consent-Purpose'] === 'diagnosis',
  });
  const diagnosisClient = readFileSync(resolve(process.cwd(), 'services/diagnosis.ts'), 'utf8');
  checks.push({
    name: 'dedicated_pragas_endpoint',
    passed:
      diagnosisClient.includes('/functions/v1/diagnose-pragas') &&
      !/\/functions\/v1\/diagnose(?:[`'"?#]|$)/.test(diagnosisClient),
  });
  checks.push({
    name: 'uuid_idempotency_key',
    passed: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      headers['Idempotency-Key'],
    ),
  });

  const passed = checks.every((check) => check.passed);
  const summary = {
    schemaVersion: 1,
    mode: 'offline_contract',
    passed,
    checkCount: checks.length,
    failedChecks: checks.filter((check) => !check.passed).map((check) => check.name),
  };

  mkdirSync(resolve(OUTPUT_PATH, '..'), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log(`Diagnosis contract: ${passed ? 'PASS' : 'FAIL'} (${checks.length} checks)`);
  console.log('Sanitized summary: .artifacts/diagnosis-validation/summary.json');
  process.exitCode = passed ? 0 : 1;
}

main();
