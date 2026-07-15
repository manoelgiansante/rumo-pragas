#!/usr/bin/env node

import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const PASSWORD_REPLACEMENT = '[REDACTED:PASSWORD]';
const BASE64_REPLACEMENT = '[REDACTED:BASE64]';
const PASSWORD_KEY = String.raw`(?:password|[A-Za-z0-9_.-]+password)`;

const escapedDoubleQuotedPassword = new RegExp(
  String.raw`((?:\\")${PASSWORD_KEY}(?:\\")\s*[:=]\s*(?:\\"))[\s\S]*?((?:\\"))`,
  'gi',
);
const doubleQuotedPassword = new RegExp(
  String.raw`((?:"?)${PASSWORD_KEY}(?:"?)\s*[:=]\s*")(?:\\.|[^"\\])*(")`,
  'gi',
);
const singleQuotedPassword = new RegExp(
  String.raw`((?:'?)${PASSWORD_KEY}(?:'?)\s*[:=]\s*')(?:\\.|[^'\\])*(')`,
  'gi',
);
const unquotedPassword = new RegExp(
  String.raw`((?:["']?)${PASSWORD_KEY}(?:["']?)\s*[:=]\s*)(?!["'\\])[^\s,}\]]+`,
  'gi',
);
const longBase64 = /(^|[^A-Za-z0-9+/_-])([A-Za-z0-9+/_-]{48,}={0,2})(?=$|[^A-Za-z0-9+/_=-])/gm;
const nonPrintingControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export function redactEasOutput(value) {
  return stripVTControlCharacters(String(value))
    .replace(nonPrintingControls, '')
    .replace(escapedDoubleQuotedPassword, `$1${PASSWORD_REPLACEMENT}$2`)
    .replace(doubleQuotedPassword, `$1${PASSWORD_REPLACEMENT}$2`)
    .replace(singleQuotedPassword, `$1${PASSWORD_REPLACEMENT}$2`)
    .replace(unquotedPassword, `$1${PASSWORD_REPLACEMENT}`)
    .replace(longBase64, `$1${BASE64_REPLACEMENT}`);
}

export async function redactEasStream(input = process.stdin, output = process.stdout) {
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
    terminal: false,
  });

  for await (const line of lines) {
    if (!output.write(`${redactEasOutput(line)}\n`)) {
      await once(output, 'drain');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  redactEasStream().catch(() => {
    process.stderr.write('ERRO: o redator seguro do log EAS falhou.\n');
    process.exitCode = 1;
  });
}
