#!/usr/bin/env node

import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const SENSITIVE_LINE_REPLACEMENT = '[REDACTED:SENSITIVE_LINE]';
const BASE64_REPLACEMENT = '[REDACTED:BASE64]';
const SENSITIVE_KEY = String.raw`[A-Za-z0-9_.-]{0,64}(?:password|passphrase|token|secret|api[_-]?key|private[_-]?key|authorization|cookie|dsn)[A-Za-z0-9_.-]{0,64}`;
const sensitiveAssignment = new RegExp(
  String.raw`(?:\\?["']|--)?${SENSITIVE_KEY}(?:\\?["'])?\s*[:=]`,
  'i',
);
const longBase64 = /(^|[^A-Za-z0-9+/_-])([A-Za-z0-9+/_-]{48,}={0,2})(?=$|[^A-Za-z0-9+/_=-])/gm;
const authorizationValue = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const jwt = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const knownSecretPrefix = /\b(?:sk|rk|gh[pousr]|github_pat|xox[baprs])[-_][A-Za-z0-9._-]{12,}\b/gi;
const credentialedUrl = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;
const privateKeyHeader = /-----BEGIN [^-]*PRIVATE KEY-----/i;
const nonPrintingControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export function redactEasOutput(value) {
  const clean = stripVTControlCharacters(String(value)).replace(nonPrintingControls, '');

  return clean
    .split('\n')
    .map((line) => {
      if (sensitiveAssignment.test(line) || privateKeyHeader.test(line)) {
        return SENSITIVE_LINE_REPLACEMENT;
      }
      return line
        .replace(authorizationValue, '$1 [REDACTED:AUTHORIZATION]')
        .replace(jwt, '[REDACTED:JWT]')
        .replace(knownSecretPrefix, '[REDACTED:TOKEN]')
        .replace(credentialedUrl, '$1[REDACTED:URL_CREDENTIAL]@')
        .replace(longBase64, `$1${BASE64_REPLACEMENT}`);
    })
    .join('\n');
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
