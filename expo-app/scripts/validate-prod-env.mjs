#!/usr/bin/env node

import { startEasEnvProbe } from './eas-env-probe.mjs';

const BASE_REQUIRED_REMOTE_NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
];

const GOOGLE_PLATFORM_NAMES = [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
];

const [environment, ...easCommand] = process.argv.slice(2);
if (!['production', 'preview', 'development'].includes(environment) || easCommand.length === 0) {
  process.exit(2);
}

const requiredRemoteNames =
  environment === 'production'
    ? [...BASE_REQUIRED_REMOTE_NAMES, ...GOOGLE_PLATFORM_NAMES]
    : BASE_REQUIRED_REMOTE_NAMES;
const optionalGoogleNames = environment === 'production' ? [] : GOOGLE_PLATFORM_NAMES;
const allRemoteNames = [...requiredRemoteNames, ...optionalGoogleNames];
const probes = [];
const completions = [];
let signalExitCode = 0;

console.log(`Validando configuração do ambiente EAS '${environment}' sem exibir valores...`);

const terminateProbes = (signal) => {
  for (const probe of probes) {
    if (signal === 'SIGKILL') probe.kill();
    else probe.cancel(signalExitCode || 143);
  }
};

const handleSignal = (exitCode) => {
  if (signalExitCode) return;
  signalExitCode = exitCode;
  terminateProbes('SIGTERM');
  Promise.all(completions).then(() => {
    process.exit(exitCode);
  });
};

for (const [signal, exitCode] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  // O listener precisa permanecer ativo durante toda a drenagem. Supervisores
  // podem reenviar o mesmo sinal; devolver o segundo à ação padrão mataria o
  // coordenador antes de ele comprovar o encerramento dos probes.
  process.on(signal, () => handleSignal(exitCode));
}

process.once('exit', () => terminateProbes('SIGKILL'));

for (const name of allRemoteNames) {
  const probe = startEasEnvProbe({
    name,
    environment,
    easCommand,
    timeoutMs: 30000,
  });
  probes.push(probe);
  completions.push(probe.completion);
}

const statuses = await Promise.all(completions);
if (signalExitCode) process.exit(signalExitCode);

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.removeAllListeners(signal);

const missing = [];
for (let index = 0; index < requiredRemoteNames.length; index += 1) {
  const name = allRemoteNames[index];
  const status = statuses[index];
  if (status === 0) {
    console.log(`OK: variável remota presente: ${name}`);
  } else if (status === 3) {
    missing.push(`EAS Environment:${name}`);
  } else if (status === 124) {
    console.error(`ERRO: consulta EAS excedeu 30 segundos para ${name}.`);
    process.exit(1);
  } else {
    console.error(`ERRO: não foi possível consultar ${name} no EAS Environment.`);
    process.exit(1);
  }
}

for (let index = requiredRemoteNames.length; index < allRemoteNames.length; index += 1) {
  const name = allRemoteNames[index];
  const status = statuses[index];
  if (status === 0) {
    console.log(`OK: provedor Google opcional configurado: ${name}`);
  } else if (status === 3) {
    console.log(`N/A: ${name} ausente; CTA Google correspondente ficará oculto.`);
  } else if (status === 124) {
    console.error(`ERRO: consulta EAS excedeu 30 segundos para ${name}.`);
    process.exit(1);
  } else {
    console.error(`ERRO: não foi possível consultar ${name} no EAS Environment.`);
    process.exit(1);
  }
}

if (missing.length > 0) {
  console.error('ERRO: configuração obrigatória ausente:');
  for (const name of missing) console.error(`  - ${name}`);
  console.error('Cadastre o valor no EAS Environment; não o passe na linha de comando.');
  process.exit(1);
}

console.log('Validação concluída. Nenhum valor foi impresso.');
