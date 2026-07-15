import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseCsv, validateDataSafetySources } from './validate-data-safety.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const landingPolicyPath = resolve(
  projectRoot,
  '../../rumo-pragas-landing/src/pages/privacidade.astro',
);
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
  Conta e perfil: telefone opcional, cidade e estado opcionais.
  mensagens e contexto do chat são enviados após o consentimento para IA.
  Os provedores são Google Gemini e Anthropic Claude.
  Não vendemos nem alugamos dados pessoais.
  A identidade global AgroRumo é compartilhada e não é apagada por essa ação específica.
`;

function mutate(text, from, to) {
  assert.ok(text.includes(from), `fixture canônica não contém ${JSON.stringify(from)}`);
  return text.replace(from, to);
}

function errorsFor(overrides = {}) {
  return validateDataSafetySources({ ...canonical, ...overrides }).errors.join('\n');
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

test('tipo selecionado com coleta/compartilhamento conflitante é rejeitado', () => {
  const csvText = mutate(
    canonical.csvText,
    'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_MESSAGES:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,true',
    'PSL_DATA_USAGE_RESPONSES:PSL_OTHER_MESSAGES:PSL_DATA_USAGE_COLLECTION_AND_SHARING,PSL_DATA_USAGE_ONLY_SHARED,',
  );
  assert.match(errorsFor({ csvText }), /PSL_OTHER_MESSAGES/u);
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

test('drift de finalidade do User ID no Privacy Manifest é rejeitado', () => {
  const appJson = JSON.parse(canonical.appJsonText);
  const userId = appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.find(
    (item) => item.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeUserID',
  );
  userId.NSPrivacyCollectedDataTypePurposes = ['NSPrivacyCollectedDataTypePurposeAppFunctionality'];
  assert.match(errorsFor({ appJsonText: JSON.stringify(appJson) }), /finalidades iOS.*UserID/u);
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
  ['telefone opcional', 'telefone/cidade/estado'],
  ['mensagens e', 'mensagens do chat'],
]) {
  test(`política in-app sem ${label} é rejeitada`, () => {
    assert.match(
      errorsFor({ appPolicyText: mutate(canonical.appPolicyText, token, 'dados omitidos') }),
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

test('remoção do bloqueador documental de exclusão falha fechada', () => {
  assert.match(errorsFor({ blockerText: '# arquivo esvaziado' }), /ACCOUNT_DELETION_BLOCKER/u);
});
