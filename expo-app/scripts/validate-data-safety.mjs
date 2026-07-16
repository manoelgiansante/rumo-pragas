#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');

export const CANONICAL_LANDING_POLICY_URL = 'https://pragas.agrorumo.com/privacidade';
const CANONICAL_POLICY_MAX_BYTES = 512 * 1024;
const CANONICAL_POLICY_TIMEOUT_MS = 15_000;

const CSV_HEADER = [
  'Question ID (machine readable)',
  'Response ID (machine readable)',
  'Response value',
  'Answer requirement',
  'Human-friendly question label',
];

const GLOBAL_ROWS = [
  ['PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA', '', 'true'],
  ['PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT', '', 'true'],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_USER_ID_PASSWORD', 'true'],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_USER_ID_OTHER_AUTH', ''],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_USER_ID_PASSWORD_OTHER_AUTH', ''],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_OAUTH', 'true'],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_OTHER', ''],
  ['PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_NONE', ''],
  ['PSL_ACM_SPECIFY', '', ''],
  ['PSL_ACCOUNT_DELETION_URL', '', ''],
  ['PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_YES', 'true'],
  ['PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_NO', ''],
  ['PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_NO_AUTO_DELETED', ''],
  ['PSL_DATA_DELETION_URL', '', 'https://pragas.agrorumo.com/delete-account'],
  ['PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY', '', ''],
  ['PSL_INDEPENDENTLY_VALIDATED', '', ''],
  ['PSL_UPI_BADGE_OPT_IN', '', ''],
  ['PSL_HAS_OUTSIDE_APP_ACCOUNTS', '', ''],
  ['PSL_OUTSIDE_APP_ACCOUNT_TYPES', 'PSL_LOGIN_WITH_OUTSIDE_APP_ID', ''],
  ['PSL_OUTSIDE_APP_ACCOUNT_TYPES', 'PSL_LOGIN_THROUGH_EMPLOYMENT_OR_ENTERPRISE_ACCOUNT', ''],
  ['PSL_OUTSIDE_APP_ACCOUNT_TYPES', 'PSL_OUTSIDE_APP_ACCOUNT_TYPE_OTHER', ''],
  ['PSL_OUTSIDE_APP_ACCOUNT_TYPE_SPECIFY', '', ''],
];

const DATA_TYPE_ROWS = [
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_NAME'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_EMAIL'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_USER_ACCOUNT'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_ADDRESS'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_PHONE'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_RACE_ETHNICITY'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_POLITICAL_RELIGIOUS'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_SEXUAL_ORIENTATION_GENDER_IDENTITY'],
  ['PSL_DATA_TYPES_PERSONAL', 'PSL_OTHER_PERSONAL'],
  ['PSL_DATA_TYPES_FINANCIAL', 'PSL_CREDIT_DEBIT_BANK_ACCOUNT_NUMBER'],
  ['PSL_DATA_TYPES_FINANCIAL', 'PSL_PURCHASE_HISTORY'],
  ['PSL_DATA_TYPES_FINANCIAL', 'PSL_CREDIT_SCORE'],
  ['PSL_DATA_TYPES_FINANCIAL', 'PSL_OTHER'],
  ['PSL_DATA_TYPES_LOCATION', 'PSL_APPROX_LOCATION'],
  ['PSL_DATA_TYPES_LOCATION', 'PSL_PRECISE_LOCATION'],
  ['PSL_DATA_TYPES_SEARCH_AND_BROWSING', 'PSL_WEB_BROWSING_HISTORY'],
  ['PSL_DATA_TYPES_EMAIL_AND_TEXT', 'PSL_EMAILS'],
  ['PSL_DATA_TYPES_EMAIL_AND_TEXT', 'PSL_SMS_CALL_LOG'],
  ['PSL_DATA_TYPES_EMAIL_AND_TEXT', 'PSL_OTHER_MESSAGES'],
  ['PSL_DATA_TYPES_PHOTOS_AND_VIDEOS', 'PSL_PHOTOS'],
  ['PSL_DATA_TYPES_PHOTOS_AND_VIDEOS', 'PSL_VIDEOS'],
  ['PSL_DATA_TYPES_AUDIO', 'PSL_AUDIO'],
  ['PSL_DATA_TYPES_AUDIO', 'PSL_MUSIC'],
  ['PSL_DATA_TYPES_AUDIO', 'PSL_OTHER_AUDIO'],
  ['PSL_DATA_TYPES_HEALTH_AND_FITNESS', 'PSL_HEALTH'],
  ['PSL_DATA_TYPES_HEALTH_AND_FITNESS', 'PSL_FITNESS'],
  ['PSL_DATA_TYPES_CONTACTS', 'PSL_CONTACTS'],
  ['PSL_DATA_TYPES_CALENDAR', 'PSL_CALENDAR'],
  ['PSL_DATA_TYPES_APP_PERFORMANCE', 'PSL_CRASH_LOGS'],
  ['PSL_DATA_TYPES_APP_PERFORMANCE', 'PSL_PERFORMANCE_DIAGNOSTICS'],
  ['PSL_DATA_TYPES_APP_PERFORMANCE', 'PSL_OTHER_PERFORMANCE'],
  ['PSL_DATA_TYPES_FILES_AND_DOCS', 'PSL_FILES_AND_DOCS'],
  ['PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_USER_INTERACTION'],
  ['PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_IN_APP_SEARCH_HISTORY'],
  ['PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_APPS_ON_DEVICE'],
  ['PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_USER_GENERATED_CONTENT'],
  ['PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_OTHER_APP_ACTIVITY'],
  ['PSL_DATA_TYPES_IDENTIFIERS', 'PSL_DEVICE_ID'],
];

const PURPOSES = [
  'PSL_APP_FUNCTIONALITY',
  'PSL_ANALYTICS',
  'PSL_DEVELOPER_COMMUNICATIONS',
  'PSL_FRAUD_PREVENTION_SECURITY',
  'PSL_ADVERTISING',
  'PSL_PERSONALIZATION',
  'PSL_ACCOUNT_MANAGEMENT',
];

const PROHIBITED_PURPOSES = new Set([
  'PSL_DEVELOPER_COMMUNICATIONS',
  'PSL_ADVERTISING',
  'PSL_PERSONALIZATION',
]);

const DATA_CONTRACT = new Map([
  [
    'PSL_NAME',
    {
      shared: true,
      optional: true,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_EMAIL',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_USER_ACCOUNT',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_ADDRESS',
    {
      shared: true,
      optional: true,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_PHONE',
    {
      shared: true,
      optional: true,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_APPROX_LOCATION',
    {
      shared: true,
      optional: true,
      collection: ['PSL_APP_FUNCTIONALITY'],
      sharing: ['PSL_APP_FUNCTIONALITY'],
    },
  ],
  [
    'PSL_OTHER_MESSAGES',
    {
      shared: true,
      optional: true,
      collection: ['PSL_APP_FUNCTIONALITY'],
      sharing: ['PSL_APP_FUNCTIONALITY'],
    },
  ],
  [
    'PSL_PHOTOS',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'],
    },
  ],
  [
    'PSL_CRASH_LOGS',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
    },
  ],
  [
    'PSL_PERFORMANCE_DIAGNOSTICS',
    {
      shared: true,
      optional: false,
      collection: ['PSL_ANALYTICS'],
      sharing: ['PSL_ANALYTICS'],
    },
  ],
  [
    'PSL_USER_INTERACTION',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
    },
  ],
  [
    'PSL_USER_GENERATED_CONTENT',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    },
  ],
  [
    'PSL_DEVICE_ID',
    {
      shared: true,
      optional: false,
      collection: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
      sharing: ['PSL_APP_FUNCTIONALITY', 'PSL_ANALYTICS'],
    },
  ],
]);

const IOS_PRIVACY_CONTRACT = new Map([
  ['NSPrivacyCollectedDataTypeName', [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']]],
  [
    'NSPrivacyCollectedDataTypeEmailAddress',
    [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypePhoneNumber',
    [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypePhysicalAddress',
    [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypeUserID',
    [
      true,
      [
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
        'NSPrivacyCollectedDataTypePurposeAnalytics',
      ],
    ],
  ],
  [
    'NSPrivacyCollectedDataTypeDeviceID',
    [
      true,
      [
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
        'NSPrivacyCollectedDataTypePurposeAnalytics',
      ],
    ],
  ],
  [
    'NSPrivacyCollectedDataTypePhotosorVideos',
    [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypeCoarseLocation',
    [true, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypeOtherUserContent',
    [
      true,
      [
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
        'NSPrivacyCollectedDataTypePurposeAnalytics',
      ],
    ],
  ],
  [
    'NSPrivacyCollectedDataTypeProductInteraction',
    [true, ['NSPrivacyCollectedDataTypePurposeAnalytics']],
  ],
  [
    'NSPrivacyCollectedDataTypeCrashData',
    [false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
  [
    'NSPrivacyCollectedDataTypePerformanceData',
    [false, ['NSPrivacyCollectedDataTypePurposeAppFunctionality']],
  ],
]);

const ALLOWED_REQUIREMENTS = new Set([
  'REQUIRED',
  'MAYBE_REQUIRED',
  'MULTIPLE_CHOICE',
  'SINGLE_CHOICE',
  'OPTIONAL',
]);

// SHA-256 of the ordered Question ID, Response ID, Answer requirement and human label columns
// from the audited Google Play export. The account-deletion row keeps the official human label;
// the canonical global-deletion URL is validated as its response value below.
// Response values are excluded so DATA_CONTRACT can validate answers while metadata stays immutable.
const EXPECTED_TEMPLATE_SEMANTICS_SHA256 =
  'd1f09672af0d589308b91d93e4644b359d905fff45dbd7924297dbbb8ec48f70';

function rowKey(questionId, responseId) {
  return `${questionId}\u0000${responseId}`;
}

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NON_VISIBLE_ELEMENTS = new Set([
  'audio',
  'canvas',
  'datalist',
  'embed',
  'head',
  'iframe',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
]);

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function removeRawNonVisibleElements(value) {
  let source = value;
  for (const element of NON_VISIBLE_ELEMENTS) {
    const paired = new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?<\\/${element}\\s*>`, 'giu');
    let previous;
    do {
      previous = source;
      source = source.replace(paired, ' ');
    } while (source !== previous);
  }
  return source;
}

function markupTokens(value) {
  const tokens = [];
  let textStart = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '<' || !/[A-Za-z!/?]/u.test(value[index + 1] ?? '')) {
      index += 1;
      continue;
    }

    let cursor = index + 1;
    let braces = 0;
    let quote = null;
    while (cursor < value.length) {
      const character = value[cursor];
      if (quote !== null) {
        if (character === '\\') cursor += 1;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'" || character === '`') {
        quote = character;
      } else if (character === '{') {
        braces += 1;
      } else if (character === '}' && braces > 0) {
        braces -= 1;
      } else if (character === '>' && braces === 0) {
        break;
      }
      cursor += 1;
    }
    if (cursor >= value.length) break;

    if (index > textStart) tokens.push({ type: 'text', value: value.slice(textStart, index) });
    tokens.push({ type: 'tag', value: value.slice(index, cursor + 1) });
    index = cursor + 1;
    textStart = index;
  }
  if (textStart < value.length) tokens.push({ type: 'text', value: value.slice(textStart) });
  return tokens;
}

function hiddenAttributes(attributes) {
  if (/(?:^|\s)(?:hidden|inert)(?=\s|=|\/|$)/iu.test(attributes)) return true;
  if (
    /(?:^|\s)aria-hidden\s*=\s*(?:["']true["']|true|\{\s*true\s*\})(?=\s|\/|$)/iu.test(attributes)
  ) {
    return true;
  }
  if (
    /(?:display\s*:\s*["']?none|visibility\s*:\s*["']?(?:hidden|collapse)|opacity\s*:\s*["']?0(?:\D|$)|font-size\s*:\s*["']?0|color\s*:\s*["']?transparent|clip(?:-path)?\s*:)/iu.test(
      attributes,
    )
  ) {
    return true;
  }

  const classValue = attributes.match(
    /(?:^|\s)class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/iu,
  );
  const classes = classValue ? (classValue[1] ?? classValue[2] ?? classValue[3] ?? '') : '';
  return /(?:^|\s)(?:[\w-]+:)*(?:hidden|invisible|opacity-0|sr-only|visually-hidden)(?=\s|$)/iu.test(
    classes,
  );
}

function stripCodeExpressions(value) {
  let output = '';
  let braces = 0;
  for (const character of value) {
    if (character === '{') braces += 1;
    else if (character === '}' && braces > 0) braces -= 1;
    else if (braces === 0) output += character;
  }
  return output;
}

function visiblePolicySource(value, { mainOnly = false } = {}) {
  let source = value
    .replace(/^---[\s\S]*?---/u, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/\{?\s*\/\*[\s\S]*?\*\/\s*\}?/gu, ' ')
    .replace(/^[ \t]*\/\/[^\r\n]*$/gmu, ' ');
  source = removeRawNonVisibleElements(source);

  const visible = [];
  const stack = [];
  let hiddenDepth = 0;
  let mainDepth = 0;
  for (const token of markupTokens(source)) {
    if (token.type === 'text') {
      if (stack.length > 0 && hiddenDepth === 0 && (!mainOnly || mainDepth > 0)) {
        visible.push(stripCodeExpressions(token.value));
      }
      continue;
    }

    const closing = token.value.match(/^<\s*\/\s*([A-Za-z][\w:.-]*)\s*>$/u);
    if (closing) {
      const name = closing[1].toLowerCase();
      const matchingIndex = stack.map((frame) => frame.name).lastIndexOf(name);
      if (matchingIndex === -1) continue;
      for (let index = stack.length - 1; index >= matchingIndex; index -= 1) {
        const frame = stack.pop();
        if (frame.hidden) hiddenDepth -= 1;
        if (frame.main) mainDepth -= 1;
      }
      continue;
    }

    const opening = token.value.match(/^<\s*([A-Za-z][\w:.-]*)([\s\S]*?)>$/u);
    if (!opening) continue;
    const name = opening[1].toLowerCase();
    const attributes = opening[2];
    const selfClosing = /\/\s*>$/u.test(token.value) || VOID_ELEMENTS.has(name);
    const hidden =
      NON_VISIBLE_ELEMENTS.has(name) ||
      hiddenAttributes(attributes) ||
      ((name === 'details' || name === 'dialog') &&
        !/(?:^|\s)open(?=\s|=|\/|$)/iu.test(attributes));
    const main = name === 'main';
    if (!selfClosing) {
      stack.push({ name, hidden, main });
      if (hidden) hiddenDepth += 1;
      if (main) mainDepth += 1;
    }
  }
  return visible.join(' ');
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.every((value, index) => value === right[index]);
}

export function parseCsv(input, source = 'CSV') {
  if (typeof input !== 'string') throw new TypeError(`${source}: conteúdo deve ser texto.`);
  if (input.includes('\u0000')) throw new Error(`${source}: byte NUL não é permitido.`);

  const text = input.startsWith('\ufeff') ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  function finishField() {
    row.push(field);
    field = '';
    closedQuote = false;
  }

  function finishRow() {
    finishField();
    rows.push(row);
    row = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote && ![',', '\r', '\n'].includes(character)) {
      throw new Error(`${source}: caractere inesperado após aspas fechadas.`);
    }
    if (character === '"') {
      if (field.length > 0 || closedQuote) {
        throw new Error(`${source}: aspas só podem iniciar um campo vazio.`);
      }
      quoted = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r') {
      if (text[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error(`${source}: campo com aspas não foi fechado.`);
  if (field.length > 0 || row.length > 0 || closedQuote) finishRow();
  if (rows.length === 0) throw new Error(`${source}: arquivo vazio.`);

  const header = rows[0];
  if (
    header.length !== CSV_HEADER.length ||
    !header.every((value, index) => value === CSV_HEADER[index])
  ) {
    throw new Error(`${source}: cabeçalho inesperado; use o template oficial de cinco colunas.`);
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].length !== CSV_HEADER.length) {
      throw new Error(
        `${source}: linha ${index + 1} tem ${rows[index].length} colunas; esperado 5.`,
      );
    }
  }
  return rows.slice(1).map((columns, index) => ({
    line: index + 2,
    questionId: columns[0],
    responseId: columns[1],
    value: columns[2],
    requirement: columns[3],
    label: columns[4],
  }));
}

function expectedCsvRows({ accountDeletionReady = false } = {}) {
  const expected = new Map();
  for (const [questionId, responseId, value] of GLOBAL_ROWS) {
    const expectedValue =
      questionId === 'PSL_ACCOUNT_DELETION_URL' && accountDeletionReady
        ? 'https://pragas.agrorumo.com/delete-account'
        : value;
    expected.set(rowKey(questionId, responseId), { value: expectedValue, context: questionId });
  }
  for (const [questionId, responseId] of DATA_TYPE_ROWS) {
    expected.set(rowKey(questionId, responseId), {
      value: DATA_CONTRACT.has(responseId) ? 'true' : '',
      context: `seleção ${responseId}`,
    });

    const contract = DATA_CONTRACT.get(responseId);
    const usageQuestion = (section) => `PSL_DATA_USAGE_RESPONSES:${responseId}:${section}`;
    const usages = [
      [
        usageQuestion('PSL_DATA_USAGE_COLLECTION_AND_SHARING'),
        'PSL_DATA_USAGE_ONLY_COLLECTED',
        contract ? 'true' : '',
      ],
      [
        usageQuestion('PSL_DATA_USAGE_COLLECTION_AND_SHARING'),
        'PSL_DATA_USAGE_ONLY_SHARED',
        contract?.shared ? 'true' : '',
      ],
      [usageQuestion('PSL_DATA_USAGE_EPHEMERAL'), '', contract ? 'false' : ''],
      [
        usageQuestion('DATA_USAGE_USER_CONTROL'),
        'PSL_DATA_USAGE_USER_CONTROL_OPTIONAL',
        contract?.optional ? 'true' : '',
      ],
      [
        usageQuestion('DATA_USAGE_USER_CONTROL'),
        'PSL_DATA_USAGE_USER_CONTROL_REQUIRED',
        contract && !contract.optional ? 'true' : '',
      ],
    ];
    for (const purpose of PURPOSES) {
      usages.push([
        usageQuestion('DATA_USAGE_COLLECTION_PURPOSE'),
        purpose,
        contract?.collection.includes(purpose) ? 'true' : '',
      ]);
    }
    for (const purpose of PURPOSES) {
      usages.push([
        usageQuestion('DATA_USAGE_SHARING_PURPOSE'),
        purpose,
        contract?.sharing.includes(purpose) ? 'true' : '',
      ]);
    }
    for (const [usageId, usageResponseId, value] of usages) {
      expected.set(rowKey(usageId, usageResponseId), {
        value,
        context: `${responseId}/${usageId.split(':').at(-1)}/${usageResponseId || 'boolean'}`,
      });
    }
  }
  return expected;
}

function validateCsv(csvText, { accountDeletionReady = false } = {}) {
  const errors = [];
  let rows;
  try {
    rows = parseCsv(csvText, 'Data Safety CSV');
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : 'Data Safety CSV inválido.'],
      rows: [],
    };
  }

  const actual = new Map();
  for (const row of rows) {
    if (!row.questionId || /\s/.test(row.questionId)) {
      errors.push(`CSV linha ${row.line}: Question ID vazio ou com espaço.`);
    }
    if (/\s/.test(row.responseId)) {
      errors.push(`CSV linha ${row.line}: Response ID contém espaço.`);
    }
    if (!ALLOWED_REQUIREMENTS.has(row.requirement)) {
      errors.push(`CSV linha ${row.line}: Answer requirement desconhecido (${row.requirement}).`);
    }
    if (!row.label.trim()) errors.push(`CSV linha ${row.line}: rótulo humano vazio.`);
    if (!['', 'true', 'false', 'https://pragas.agrorumo.com/delete-account'].includes(row.value)) {
      errors.push(`CSV linha ${row.line}: valor inesperado ${JSON.stringify(row.value)}.`);
    }
    const key = rowKey(row.questionId, row.responseId);
    const previous = actual.get(key);
    if (previous) {
      errors.push(
        `CSV linha ${row.line}: resposta duplicada; a mesma chave já existe na linha ${previous.line}.`,
      );
    } else {
      actual.set(key, row);
    }
    if (PROHIBITED_PURPOSES.has(row.responseId) && row.value === 'true') {
      errors.push(`CSV linha ${row.line}: finalidade proibida selecionada (${row.responseId}).`);
    }
  }

  const templateSemantics = rows.map(({ questionId, responseId, requirement, label }) => [
    questionId,
    responseId,
    requirement,
    label,
  ]);
  const templateDigest = createHash('sha256')
    .update(JSON.stringify(templateSemantics))
    .digest('hex');
  if (templateDigest !== EXPECTED_TEMPLATE_SEMANTICS_SHA256) {
    errors.push(
      'CSV: metadados do template oficial divergentes (ordem, requirement ou rótulo humano).',
    );
  }

  const expected = expectedCsvRows({ accountDeletionReady });
  for (const [key, row] of actual) {
    if (!expected.has(key)) {
      errors.push(
        `CSV linha ${row.line}: linha desconhecida ou fora do template (${row.questionId}/${row.responseId || '∅'}).`,
      );
    }
  }
  for (const [key, definition] of expected) {
    const row = actual.get(key);
    if (!row) {
      errors.push(`CSV: resposta obrigatória do template ausente (${definition.context}).`);
    } else if (row.value !== definition.value) {
      errors.push(
        `CSV linha ${row.line}: ${definition.context} deve ser ${JSON.stringify(definition.value)}, recebido ${JSON.stringify(row.value)}.`,
      );
    }
  }

  return { errors, rows };
}

function validateAppJson(appJsonText) {
  const errors = [];
  let appJson;
  try {
    appJson = JSON.parse(appJsonText);
  } catch {
    return ['app.json: JSON inválido.'];
  }
  const expo = appJson?.expo;
  if (expo?.android?.package !== 'com.agrorumo.rumopragas') {
    errors.push('app.json: android.package diverge de com.agrorumo.rumopragas.');
  }
  if (expo?.ios?.bundleIdentifier !== 'com.agrorumo.rumopragas') {
    errors.push('app.json: ios.bundleIdentifier diverge de com.agrorumo.rumopragas.');
  }
  const pluginOptions = new Map();
  for (const plugin of Array.isArray(expo?.plugins) ? expo.plugins : []) {
    if (Array.isArray(plugin) && typeof plugin[0] === 'string') {
      pluginOptions.set(plugin[0], plugin[1]);
    }
  }
  const cameraOptions = pluginOptions.get('expo-camera');
  const imagePickerOptions = pluginOptions.get('expo-image-picker');
  const permissionClaims = [
    ['ios.infoPlist.NSCameraUsageDescription', expo?.ios?.infoPlist?.NSCameraUsageDescription],
    [
      'ios.infoPlist.NSPhotoLibraryUsageDescription',
      expo?.ios?.infoPlist?.NSPhotoLibraryUsageDescription,
    ],
    ['expo-camera.cameraPermission', cameraOptions?.cameraPermission],
    ['expo-image-picker.cameraPermission', imagePickerOptions?.cameraPermission],
    ['expo-image-picker.photosPermission', imagePickerOptions?.photosPermission],
  ];
  for (const [claim, value] of permissionClaims) {
    const normalized = typeof value === 'string' ? normalizeText(value) : '';
    if (!normalized.includes('foto de perfil opcional') || !normalized.includes('triagem visual')) {
      errors.push(`app.json: ${claim} deve explicar foto de perfil opcional e triagem visual.`);
    }
  }
  const privacy = expo?.ios?.privacyManifests;
  if (privacy?.NSPrivacyTracking !== false) {
    errors.push('app.json: NSPrivacyTracking deve permanecer false.');
  }
  const collected = privacy?.NSPrivacyCollectedDataTypes;
  if (!Array.isArray(collected)) {
    errors.push('app.json: NSPrivacyCollectedDataTypes ausente.');
    return errors;
  }

  const actual = new Map();
  for (const item of collected) {
    const type = item?.NSPrivacyCollectedDataType;
    if (typeof type !== 'string' || !type) {
      errors.push('app.json: categoria de dado iOS inválida.');
      continue;
    }
    if (actual.has(type)) errors.push(`app.json: categoria iOS duplicada (${type}).`);
    else actual.set(type, item);
    if (item.NSPrivacyCollectedDataTypeTracking !== false) {
      errors.push(`app.json: ${type} não pode ser usado para tracking.`);
    }
    const purposes = item.NSPrivacyCollectedDataTypePurposes;
    if (
      Array.isArray(purposes) &&
      purposes.some((purpose) =>
        [
          'NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising',
          'NSPrivacyCollectedDataTypePurposeDevelopersAdvertising',
          'NSPrivacyCollectedDataTypePurposeProductPersonalization',
        ].includes(purpose),
      )
    ) {
      errors.push(`app.json: ${type} contém finalidade de anúncios/personalização proibida.`);
    }
  }

  for (const [type, [linked, purposes]] of IOS_PRIVACY_CONTRACT) {
    const item = actual.get(type);
    if (!item) {
      errors.push(`app.json: categoria iOS esperada ausente (${type}).`);
      continue;
    }
    if (item.NSPrivacyCollectedDataTypeLinked !== linked) {
      errors.push(`app.json: ${type} possui vínculo ao usuário divergente.`);
    }
    if (!sameStringSet(item.NSPrivacyCollectedDataTypePurposes, purposes)) {
      errors.push(`app.json: finalidades iOS divergentes para ${type}.`);
    }
  }
  for (const type of actual.keys()) {
    if (!IOS_PRIVACY_CONTRACT.has(type)) {
      errors.push(`app.json: categoria iOS desconhecida sem correspondência auditada (${type}).`);
    }
  }
  return errors;
}

function validatePolicy(policyText, label) {
  const errors = [];
  const normalized = normalizeText(visiblePolicySource(policyText));
  const requiredSource =
    label === 'Política web canônica'
      ? normalizeText(visiblePolicySource(policyText, { mainOnly: true }))
      : normalized;
  const required = [
    ['nome, e-mail', 'nome e e-mail da conta'],
    ['telefone opcional, cidade e estado opcionais', 'telefone, cidade e estado opcionais'],
    [
      'identificador da conta tambem pode vincular eventos de uso',
      'uso analítico do identificador da conta',
    ],
    ['foto de perfil opcional', 'foto de perfil opcional e sua finalidade'],
    ['mensagens do assistente (opcional)', 'caráter opcional das mensagens do assistente'],
    ['mensagens e contexto do chat', 'mensagens e contexto do chat'],
    ['veredito, alternativa e notas opcionais', 'feedback do diagnóstico'],
    ['denuncia de conteudo de ia', 'denúncia de conteúdo de IA'],
    ['consentimento para ia', 'consentimento antes do envio à IA'],
    ['consentimento pode ser revogado nos ajustes', 'revogação do consentimento de IA'],
    ['execucao do servico solicitado', 'base legal de execução do serviço'],
    ['legitimo interesse', 'base legal de legítimo interesse'],
    ['identificadores tecnicos do dispositivo', 'identificadores técnicos do dispositivo'],
    ['google gemini', 'Google Gemini'],
    ['anthropic claude', 'Anthropic Claude'],
    ['nao vendemos nem alugamos dados pessoais', 'ausência de venda ou aluguel de dados'],
    ['conta agrorumo inteira', 'escopo de exclusão da conta AgroRumo inteira'],
    ['autenticar', 'reautenticação antes do pedido global'],
    ['revogad', 'revogação imediata do push do Rumo Pragas'],
    ['coordenad', 'processamento coordenado entre produtos'],
    ['15 dias', 'prazo do processamento coordenado'],
    ['opaco', 'recibo ou protocolo opaco sem PII'],
  ];
  for (const [token, description] of required) {
    if (!requiredSource.includes(token))
      errors.push(`${label}: falta menção explícita a ${description}.`);
  }

  const commercialClaims = normalized.replaceAll('nao vendemos nem alugamos dados pessoais', ' ');
  if (
    /\b(?:vendemos|alugamos|comercializamos|negociamos)\b[^.!?]{0,120}\bdados\b/u.test(
      commercialClaims,
    ) ||
    /\b(?:usamos|compartilhamos)\b[^.!?]{0,120}\b(?:publicidade|marketing|anunciantes)\b/u.test(
      commercialClaims,
    )
  ) {
    errors.push(`${label}: foi encontrada venda ou finalidade positiva de publicidade/marketing.`);
  }

  if (
    /\b(?:conta|identidade)(?:\s+global)?\s+agrorumo\b[^.!?]{0,160}\b(?:ja\s+(?:foi|esta)|imediatamente|no momento)\b[^.!?]{0,80}\b(?:apagada|excluida|eliminada|removida)\b/u.test(
      normalized,
    )
  ) {
    errors.push(`${label}: foi encontrada promessa de conclusão imediata da exclusão global.`);
  }
  return errors;
}

function validateBlocker(blockerText) {
  const normalized = normalizeText(blockerText);
  const errors = [];
  for (const token of [
    'candidato global ainda nao esta publicado',
    'campo de exclusao de conta deve permanecer vazio',
    'conta global',
    'apple_sign_in_key_id',
    'asc_api_',
    'nao sao validas',
    'conta qa descartavel',
  ]) {
    if (!normalized.includes(token)) {
      errors.push(`ACCOUNT_DELETION_BLOCKER.md: garantia ausente (${token}).`);
    }
  }
  return errors;
}

export function validateDataSafetySources({
  csvText,
  appJsonText,
  appPolicyText,
  blockerText,
  landingPolicyText,
}) {
  // Presence of the blocker is the source-of-truth pre-deploy gate. While it
  // exists, advertising the public URL as whole-account deletion would be a
  // false store declaration. Removing it flips the contract fail-closed: the
  // same CSV must then publish the canonical URL.
  const accountDeletionReady = blockerText === undefined;
  const csv = validateCsv(csvText, { accountDeletionReady });
  const errors = [
    ...csv.errors,
    ...validateAppJson(appJsonText),
    ...validatePolicy(appPolicyText, 'Política in-app'),
  ];
  if (blockerText !== undefined) errors.push(...validateBlocker(blockerText));
  if (landingPolicyText !== undefined) {
    errors.push(...validatePolicy(landingPolicyText, 'Política web canônica'));
  }
  return { errors, declaredDataTypes: DATA_CONTRACT.size, csvRows: csv.rows.length };
}

function readSource(path, label, errors) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    errors.push(
      `${label}: não foi possível ler ${path} (${error instanceof Error ? error.message : 'erro'}).`,
    );
    return null;
  }
}

export function validateDataSafetyFiles(options = {}) {
  if (options.landingPolicyPath !== undefined && options.landingPolicyText !== undefined) {
    return {
      errors: [
        'Política web canônica: informe somente landingPolicyPath ou landingPolicyText, nunca ambos.',
      ],
      declaredDataTypes: DATA_CONTRACT.size,
      csvRows: 0,
    };
  }
  const paths = {
    csv:
      options.csvPath ?? resolve(projectRoot, 'store-assets/android/pragas-datasafety-filled.csv'),
    appJson: options.appJsonPath ?? resolve(projectRoot, 'app.json'),
    appPolicy: options.appPolicyPath ?? resolve(projectRoot, 'app/privacy.tsx'),
    blocker:
      options.blockerPath === null
        ? undefined
        : (options.blockerPath ?? resolve(projectRoot, 'store-assets/ACCOUNT_DELETION_BLOCKER.md')),
    landingPolicy: options.landingPolicyPath,
  };
  const readErrors = [];
  const sources = {
    csvText: readSource(paths.csv, 'Data Safety CSV', readErrors),
    appJsonText: readSource(paths.appJson, 'app.json', readErrors),
    appPolicyText: readSource(paths.appPolicy, 'Política in-app', readErrors),
  };
  if (paths.blocker !== undefined) {
    sources.blockerText = readSource(paths.blocker, 'ACCOUNT_DELETION_BLOCKER.md', readErrors);
  }
  if (paths.landingPolicy !== undefined) {
    sources.landingPolicyText = readSource(
      paths.landingPolicy,
      'Política web canônica',
      readErrors,
    );
  } else if (options.landingPolicyText !== undefined) {
    if (typeof options.landingPolicyText !== 'string') {
      readErrors.push('Política web canônica: conteúdo remoto deve ser texto.');
    } else {
      sources.landingPolicyText = options.landingPolicyText;
    }
  }
  if (readErrors.length > 0 || Object.values(sources).some((source) => source === null)) {
    return { errors: readErrors, declaredDataTypes: DATA_CONTRACT.size, csvRows: 0 };
  }
  return validateDataSafetySources(sources);
}

async function readLimitedHtmlResponse(response) {
  if (response.status !== 200) {
    throw new Error(`resposta HTTP ${response.status}; esperado 200`);
  }
  if (response.redirected || response.url !== CANONICAL_LANDING_POLICY_URL) {
    throw new Error('a resposta não corresponde diretamente à URL canônica, sem redirects');
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html')) {
    throw new Error(`Content-Type inválido (${contentType || 'ausente'}); esperado text/html`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) {
      throw new Error('Content-Length inválido');
    }
    if (Number(contentLength) > CANONICAL_POLICY_MAX_BYTES) {
      throw new Error(`política excede ${CANONICAL_POLICY_MAX_BYTES} bytes`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('resposta HTML sem corpo legível');

  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > CANONICAL_POLICY_MAX_BYTES) {
      await reader.cancel('limite de tamanho excedido').catch(() => {});
      throw new Error(`política excede ${CANONICAL_POLICY_MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('corpo da política não é UTF-8 válido');
  }
  if (text.includes('\u0000')) throw new Error('corpo da política contém byte NUL');
  return text;
}

export async function readCanonicalLandingPolicy(fetchImplementation = globalThis.fetch) {
  if (typeof fetchImplementation !== 'function') {
    throw new TypeError('implementação de fetch indisponível');
  }

  let response;
  try {
    response = await fetchImplementation(CANONICAL_LANDING_POLICY_URL, {
      headers: { Accept: 'text/html' },
      redirect: 'error',
      signal: AbortSignal.timeout(CANONICAL_POLICY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `não foi possível obter a política canônica (${error instanceof Error ? error.message : 'erro de rede'})`,
    );
  }
  return readLimitedHtmlResponse(response);
}

function parseArguments(argv) {
  const keys = new Map([
    ['--csv', 'csvPath'],
    ['--app-json', 'appJsonPath'],
    ['--app-policy', 'appPolicyPath'],
    ['--blocker', 'blockerPath'],
    ['--landing-policy', 'landingPolicyPath'],
    ['--landing-policy-url', 'landingPolicyUrl'],
  ]);
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = keys.get(argv[index]);
    if (!option || index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
      throw new Error(`argumento inválido ou sem valor: ${argv[index] ?? '∅'}`);
    }
    if (options[option] !== undefined) throw new Error(`argumento duplicado: ${argv[index]}`);
    options[option] = option === 'landingPolicyUrl' ? argv[index + 1] : resolve(argv[index + 1]);
    index += 1;
  }
  if (options.landingPolicyPath !== undefined && options.landingPolicyUrl !== undefined) {
    throw new Error('--landing-policy e --landing-policy-url são mutuamente exclusivos');
  }
  if (
    options.landingPolicyUrl !== undefined &&
    options.landingPolicyUrl !== CANONICAL_LANDING_POLICY_URL
  ) {
    throw new Error(`--landing-policy-url aceita somente ${CANONICAL_LANDING_POLICY_URL}`);
  }
  return options;
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) {
  async function runCli() {
    let options;
    try {
      options = parseArguments(process.argv.slice(2));
    } catch (error) {
      console.error(
        `Uso inválido: ${error instanceof Error ? error.message : 'argumento inválido'}`,
      );
      return 2;
    }

    if (options.landingPolicyUrl !== undefined) {
      try {
        options.landingPolicyText = await readCanonicalLandingPolicy();
      } catch (error) {
        console.error('BLOQUEADO: contrato Data Safety/LGPD divergente:');
        console.error(
          `  - Política web canônica: ${error instanceof Error ? error.message : 'erro de rede'}.`,
        );
        return 3;
      }
    }

    const result = validateDataSafetyFiles(options);
    if (result.errors.length > 0) {
      console.error('BLOQUEADO: contrato Data Safety/LGPD divergente:');
      for (const error of result.errors) console.error(`  - ${error}`);
      return 3;
    }
    const policyScope =
      options.landingPolicyPath || options.landingPolicyUrl
        ? 'políticas in-app e web'
        : 'política in-app';
    console.log(
      `Data Safety validado: ${result.declaredDataTypes} tipos declarados, ${result.csvRows} respostas e ${policyScope} consistentes.`,
    );
    return 0;
  }

  process.exitCode = await runCli();
}
