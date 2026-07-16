import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  CANONICAL_LANDING_POLICY_URL,
  parseCsv,
  readCanonicalLandingPolicy,
  validateDataSafetySources,
} from './validate-data-safety.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const landingRoot = resolve(projectRoot, '../../rumo-pragas-landing');
const landingPolicyPath = resolve(landingRoot, 'src/pages/privacidade.astro');
const canonical = {
  csvText: readFileSync(
    resolve(projectRoot, 'store-assets/android/pragas-datasafety-filled.csv'),
    'utf8',
  ),
  appJsonText: readFileSync(resolve(projectRoot, 'app.json'), 'utf8'),
  appPolicyText: readFileSync(resolve(projectRoot, 'app/privacy.tsx'), 'utf8'),
  blockerText: readFileSync(
    resolve(projectRoot, 'store-assets/ACCOUNT_DELETION_BLOCKER.md'),
    'utf8',
  ),
};

const completePolicyFixture = `
<main>
  Conta e perfil: nome, e-mail, telefone opcional, cidade e estado opcionais; foto de perfil opcional.
  O identificador da conta também pode vincular eventos de uso.
  Mensagens do assistente (opcional): mensagens e contexto do chat são enviados após o consentimento para IA.
  O feedback inclui veredito, alternativa e notas opcionais. A denúncia de conteúdo de IA é revista.
  A execução do serviço solicitado e o legítimo interesse são bases legais aplicáveis.
  O consentimento pode ser revogado nos Ajustes.
  Tratamos identificadores técnicos do dispositivo.
  Os provedores são Google Gemini e Anthropic Claude.
  Não vendemos nem alugamos dados pessoais.
  A identidade global AgroRumo é compartilhada e não é apagada por essa ação específica.
</main>
`;

function mutate(text, from, to) {
  assert.ok(text.includes(from), `fixture canônica não contém ${JSON.stringify(from)}`);
  return text.replace(from, to);
}

function errorsFor(overrides = {}) {
  return validateDataSafetySources({ ...canonical, ...overrides }).errors.join('\n');
}

function canonicalResponse(body, options = {}) {
  const response = new Response(body, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
  });
  Object.defineProperties(response, {
    redirected: { value: options.redirected ?? false },
    url: { value: options.url ?? CANONICAL_LANDING_POLICY_URL },
  });
  return response;
}

test('artefatos canônicos de Data Safety passam no modo fail-closed', () => {
  const result = validateDataSafetySources(canonical);
  assert.deepEqual(result.errors, []);
  assert.equal(result.declaredDataTypes, 13);
  assert.equal(result.csvRows, 782);
});

test(
  'política web canônica satisfaz o mesmo contrato quando o repositório irmão está disponível',
  { skip: !existsSync(landingPolicyPath) },
  () => {
    const result = validateDataSafetySources({
      ...canonical,
      landingPolicyText: readFileSync(landingPolicyPath, 'utf8'),
    });
    assert.deepEqual(result.errors, []);
  },
);

test('CI principal e da landing mantêm o gate canônico cruzado', () => {
  for (const workflow of ['ci.yml', 'pr-check.yml']) {
    const content = readFileSync(resolve(projectRoot, '../.github/workflows', workflow), 'utf8');
    assert.doesNotMatch(content, /repository: manoelgiansante\/rumo-pragas-landing-nextjs/u);
    assert.match(
      content,
      /validate-data-safety\.mjs --landing-policy-url https:\/\/pragas\.agrorumo\.com\/privacidade/u,
    );
  }

  if (existsSync(resolve(landingRoot, '.github/workflows'))) {
    for (const workflow of ['lighthouse.yml', 'playwright.yml']) {
      const content = readFileSync(resolve(landingRoot, '.github/workflows', workflow), 'utf8');
      assert.match(content, /repository: manoelgiansante\/rumo-pragas/u);
      assert.match(content, /validate-data-safety\.mjs --landing-policy/u);
    }
  }
});

test('leitor remoto usa somente a URL canônica e bloqueia redirects', async () => {
  let request;
  const html = await readCanonicalLandingPolicy(async (url, options) => {
    request = { url, options };
    return canonicalResponse(completePolicyFixture);
  });

  assert.equal(html, completePolicyFixture);
  assert.equal(request.url, CANONICAL_LANDING_POLICY_URL);
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Accept, 'text/html');
  assert.ok(request.options.signal instanceof AbortSignal);

  await assert.rejects(
    () =>
      readCanonicalLandingPolicy(async () =>
        canonicalResponse(completePolicyFixture, { redirected: true }),
      ),
    /sem redirects/u,
  );
  await assert.rejects(
    () =>
      readCanonicalLandingPolicy(async () =>
        canonicalResponse(completePolicyFixture, { url: 'https://example.com/privacidade' }),
      ),
    /URL canônica/u,
  );
});

test('leitor remoto falha fechado para status, MIME e tamanho inválidos', async () => {
  await assert.rejects(
    () =>
      readCanonicalLandingPolicy(async () => canonicalResponse('indisponível', { status: 503 })),
    /HTTP 503/u,
  );
  await assert.rejects(
    () =>
      readCanonicalLandingPolicy(async () =>
        canonicalResponse('texto', { headers: { 'content-type': 'text/plain' } }),
      ),
    /Content-Type inválido/u,
  );
  await assert.rejects(
    () =>
      readCanonicalLandingPolicy(async () =>
        canonicalResponse('curto', { headers: { 'content-length': '524289' } }),
      ),
    /excede 524288 bytes/u,
  );
  await assert.rejects(
    () => readCanonicalLandingPolicy(async () => canonicalResponse('x'.repeat(524_289))),
    /excede 524288 bytes/u,
  );
});

test('leitor remoto rejeita conteúdo NUL ou fora de UTF-8', async () => {
  await assert.rejects(
    () => readCanonicalLandingPolicy(async () => canonicalResponse('inválido\u0000')),
    /byte NUL/u,
  );
  await assert.rejects(
    () => readCanonicalLandingPolicy(async () => canonicalResponse(new Uint8Array([0xc3, 0x28]))),
    /UTF-8 válido/u,
  );
});

test('parser CSV aceita vírgulas e aspas escapadas em campos oficiais', () => {
  const rows = parseCsv(
    'Question ID (machine readable),Response ID (machine readable),Response value,Answer requirement,Human-friendly question label\r\nQ,R,true,REQUIRED,"texto, com ""aspas"""\r\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'texto, com "aspas"');
});

test('parser CSV rejeita aspas abertas, byte NUL e conteúdo após aspas', () => {
  const header =
    'Question ID (machine readable),Response ID (machine readable),Response value,Answer requirement,Human-friendly question label\n';
  assert.throws(() => parseCsv(`${header}Q,R,true,REQUIRED,"aberto`), /não foi fechado/u);
  assert.throws(() => parseCsv(`${header}Q,R,true,REQUIRED,inválido\u0000`), /NUL/u);
  assert.throws(() => parseCsv(`${header}Q,R,true,REQUIRED,"fechado"lixo`), /inesperado/u);
});

test('duplicata de Question ID e Response ID é rejeitada', () => {
  const duplicate = canonical.csvText.split(/\r?\n/u)[1];
  assert.match(
    errorsFor({ csvText: `${canonical.csvText.trimEnd()}\n${duplicate}\n` }),
    /duplicada/u,
  );
});

test('linha desconhecida ou removida do template é rejeitada', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_TYPES_PERSONAL,PSL_NAME,true',
    'PSL_DATA_TYPES_PERSONAL_UNKNOWN,PSL_NAME,true',
  );
  assert.match(errorsFor({ csvText }), /desconhecida|ausente/u);
});

test('requirement, rótulo e ordem do template oficial não podem sofrer drift', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_TYPES_PERSONAL,PSL_PHONE,true,MULTIPLE_CHOICE,Informações pessoais / Número de telefone',
    'PSL_DATA_TYPES_PERSONAL,PSL_PHONE,true,REQUIRED,rótulo adulterado',
  );
  assert.match(errorsFor({ csvText }), /metadados do template oficial/u);
});

test('tipo selecionado com coleta/compartilhamento conflitante é rejeitado', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_MESSAGES:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_MESSAGES:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,',
  );
  assert.match(errorsFor({ csvText }), /PSL_OTHER_MESSAGES/u);
});

test('compartilhamento conservador com Supabase não pode ser removido silenciosamente', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_NAME:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_NAME:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,',
  );
  assert.match(errorsFor({ csvText }), /PSL_NAME/u);
});

test('finalidade de gerenciamento da foto de perfil não pode ser omitida', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_COLLECTION_PURPOSE,PSL_ACCOUNT_MANAGEMENT,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_PHOTOS:DATA_USAGE_COLLECTION_PURPOSE,PSL_ACCOUNT_MANAGEMENT,',
  );
  assert.match(errorsFor({ csvText }), /PSL_PHOTOS/u);
});

test('analytics e segurança de feedback/denúncias não podem ser omitidas', () => {
  let csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_USER_GENERATED_CONTENT:DATA_USAGE_COLLECTION_PURPOSE,PSL_ANALYTICS,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_USER_GENERATED_CONTENT:DATA_USAGE_COLLECTION_PURPOSE,PSL_ANALYTICS,',
  );
  csvText = mutate(
    csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_USER_GENERATED_CONTENT:DATA_USAGE_SHARING_PURPOSE,PSL_FRAUD_PREVENTION_SECURITY,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_USER_GENERATED_CONTENT:DATA_USAGE_SHARING_PURPOSE,PSL_FRAUD_PREVENTION_SECURITY,',
  );
  assert.match(errorsFor({ csvText }), /PSL_USER_GENERATED_CONTENT/u);
});

test('required/optional divergente é rejeitado', () => {
  let csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_PHONE:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_OPTIONAL,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_PHONE:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_OPTIONAL,',
  );
  csvText = mutate(
    csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_PHONE:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_REQUIRED,,',
    'PSL_DATA_USAGE_RESPONSES:PSL_PHONE:DATA_USAGE_USER_CONTROL,PSL_DATA_USAGE_USER_CONTROL_REQUIRED,true,',
  );
  assert.match(errorsFor({ csvText }), /PSL_PHONE/u);
});

test('finalidades de publicidade, personalização e comunicação são proibidas', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_NAME:DATA_USAGE_COLLECTION_PURPOSE,PSL_ADVERTISING,,',
    'PSL_DATA_USAGE_RESPONSES:PSL_NAME:DATA_USAGE_COLLECTION_PURPOSE,PSL_ADVERTISING,true,',
  );
  assert.match(errorsFor({ csvText }), /finalidade proibida/u);
});

test('valores booleanos com caixa ou grafia desconhecida são rejeitados', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_TYPES_PERSONAL,PSL_NAME,true',
    'PSL_DATA_TYPES_PERSONAL,PSL_NAME,TRUE',
  );
  assert.match(errorsFor({ csvText }), /valor inesperado|deve ser/u);
});

test('URL de exclusão de conta não pode contornar o bloqueio AgroRumo', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_ACCOUNT_DELETION_URL,,,MAYBE_REQUIRED',
    'PSL_ACCOUNT_DELETION_URL,,https://pragas.agrorumo.com/delete-account,MAYBE_REQUIRED',
  );
  assert.match(errorsFor({ csvText }), /PSL_ACCOUNT_DELETION_URL/u);
});

test('drift de telefone no Privacy Manifest é rejeitado', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes =
    appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.filter(
      (item) => item.NSPrivacyCollectedDataType !== 'NSPrivacyCollectedDataTypePhoneNumber',
    );
  assert.match(errorsFor({ appJsonText: JSON.stringify(appJson) }), /PhoneNumber/u);
});

test('prompts nativos de câmera e galeria não podem omitir a foto de perfil', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  appJson.expo.ios.infoPlist.NSCameraUsageDescription =
    'Usa a câmera somente para uma triagem visual.';
  assert.match(
    errorsFor({ appJsonText: JSON.stringify(appJson) }),
    /NSCameraUsageDescription.*foto de perfil opcional/u,
  );
});

test('drift de finalidade do User ID no Privacy Manifest é rejeitado', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  const userId = appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.find(
    (item) => item.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeUserID',
  );
  userId.NSPrivacyCollectedDataTypePurposes = ['NSPrivacyCollectedDataTypePurposeAppFunctionality'];
  assert.match(errorsFor({ appJsonText: JSON.stringify(appJson) }), /finalidades iOS.*UserID/u);
});

test('drift de Device ID no Privacy Manifest é rejeitado', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes =
    appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.filter(
      (item) => item.NSPrivacyCollectedDataType !== 'NSPrivacyCollectedDataTypeDeviceID',
    );
  assert.match(errorsFor({ appJsonText: JSON.stringify(appJson) }), /DeviceID/u);
});

test('categoria duplicada ou finalidade de anúncios no Privacy Manifest é rejeitada', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  const first = structuredClone(appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes[0]);
  first.NSPrivacyCollectedDataTypePurposes.push(
    'NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising',
  );
  appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.push(first);
  const errors = errorsFor({ appJsonText: JSON.stringify(appJson) });
  assert.match(errors, /duplicada/u);
  assert.match(errors, /anúncios\/personalização/u);
});

for (const [token, label] of [
  ['nome, e-mail', 'nome/e-mail'],
  ['telefone opcional', 'telefone/cidade/estado'],
  ['identificador da conta também pode vincular eventos de uso', 'User ID em analytics'],
  ['foto de perfil opcional', 'foto de perfil'],
  ['Mensagens do assistente (opcional)', 'caráter opcional das mensagens'],
  ['mensagens e', 'mensagens do chat'],
  ['veredito, alternativa', 'feedback do diagnóstico'],
  ['denúncia de conteúdo', 'denúncia de IA'],
  ['execução do serviço solicitado', 'bases legais'],
  ['identificadores técnicos do dispositivo', 'Device ID'],
]) {
  test(`política in-app sem ${label} é rejeitada`, () => {
    assert.ok(canonical.appPolicyText.includes(token));
    assert.match(
      errorsFor({ appPolicyText: canonical.appPolicyText.replaceAll(token, 'dados omitidos') }),
      /Política in-app/u,
    );
  });

  test(`política web sem ${label} é rejeitada`, () => {
    assert.match(
      errorsFor({
        landingPolicyText: mutate(completePolicyFixture, token, 'dados omitidos'),
      }),
      /Política web canônica/u,
    );
  });
}

test('política sem transparência de provedor, venda ou identidade compartilhada é rejeitada', () => {
  const appPolicyText = canonical.appPolicyText
    .replace('Google Gemini', 'provedor A')
    .replace('Não vendemos', 'Tratamos')
    .replace('não é apagada por essa ação específica', 'é tratada separadamente');
  const errors = errorsFor({ appPolicyText });
  assert.match(errors, /Google Gemini/u);
  assert.match(errors, /venda ou aluguel/u);
  assert.match(errors, /limite da exclusão/u);
});

test('comentários não satisfazem divulgações legais obrigatórias', () => {
  const commentOnly = `/* ${completePolicyFixture} */`;
  const errors = errorsFor({ appPolicyText: commentOnly, landingPolicyText: commentOnly });
  assert.match(errors, /Política in-app/u);
  assert.match(errors, /Política web canônica/u);
});

test('script, template e elementos ocultos não satisfazem divulgações públicas', () => {
  const claims = completePolicyFixture.replace(/<\/?main>/gu, '');
  for (const [label, hiddenClaims] of [
    ['script', `<script type="application/json">${claims}</script>`],
    ['template', `<template>${claims}</template>`],
    ['hidden', `<section hidden>${claims}</section>`],
    ['aria-hidden', `<section aria-hidden="true">${claims}</section>`],
    ['display-none', `<section style="display: none">${claims}</section>`],
    ['utility-class', `<section class="sr-only">${claims}</section>`],
  ]) {
    const errors = errorsFor({
      landingPolicyText: `<html><body><main><p>Política sem divulgações.</p>${hiddenClaims}</main></body></html>`,
    });
    assert.match(errors, /Política web canônica: falta menção explícita/u, label);
  }
});

test('divulgações web obrigatórias precisam estar no conteúdo principal', () => {
  const claims = completePolicyFixture.replace(/<\/?main>/gu, '');
  const errors = errorsFor({
    landingPolicyText: `<html><body><main>Política sem divulgações.</main><footer>${claims}</footer></body></html>`,
  });
  assert.match(errors, /Política web canônica: falta menção explícita/u);
});

test('afirmações positivas de venda ou publicidade contraditória são rejeitadas', () => {
  const errors = errorsFor({
    appPolicyText: `${canonical.appPolicyText}\n<Text>Vendemos dados pessoais a anunciantes.</Text>`,
    landingPolicyText: `${completePolicyFixture}\n<p>Usamos dados para publicidade.</p>`,
  });
  assert.match(errors, /Política in-app:.*venda/u);
  assert.match(errors, /Política web canônica:.*publicidade/u);
});

test('promessa contraditória de exclusão integral da conta global é rejeitada', () => {
  const errors = errorsFor({
    appPolicyText: `${canonical.appPolicyText}\n<Text>A conta global AgroRumo é apagada integralmente.</Text>`,
    landingPolicyText: `${completePolicyFixture}\n<p>A identidade global AgroRumo será excluída integralmente.</p>`,
  });
  assert.match(errors, /Política in-app:.*conta global/u);
  assert.match(errors, /Política web canônica:.*conta global/u);
});

test('remoção do bloqueador documental de exclusão falha fechada', () => {
  assert.match(errorsFor({ blockerText: '# arquivo esvaziado' }), /ACCOUNT_DELETION_BLOCKER/u);
});
