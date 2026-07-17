// @ts-check
/**
 * Expo config plugin: withKotlinInProcess
 *
 * Injeta no `android/gradle.properties` (gerado pelo prebuild) as propriedades que
 * desligam os daemons persistentes do Gradle/Kotlin no build local de produção:
 *
 *   kotlin.compiler.execution.strategy=in-process
 *   org.gradle.daemon=false
 *   org.gradle.parallel=false
 *
 * Motivo (causa raiz confirmada por thread-dump): o Gradle 9.0 (RN 0.83.6) deixa
 * daemons Kotlin persistentes (`kotlin-compiler-embeddable`, keepalive ~2h) após o
 * build. O wrapper de build local roda `gradlew --no-daemon` e depois espera todo o
 * process-group morrer, tratando qualquer processo residual como falha -> trava ~2h
 * sem gerar o AAB. Compilar o Kotlin in-process (mesma JVM do Gradle) elimina o
 * daemon Kotlin, e `org.gradle.daemon=false` garante que o próprio Gradle não deixe
 * daemon vivo.
 *
 * `org.gradle.parallel=false` serializa a execução do Gradle: o build paralelo causa
 * uma race no C++ do novo arch (`libworklets.so missing, no known rule to make it`) —
 * `expo-modules-core` linka antes de `react-native-worklets` terminar. Serializar
 * força a ordem correta de build.
 *
 * O plugin é idempotente: se a propriedade já existir, apenas garante o valor correto;
 * caso contrário, adiciona.
 */

const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Propriedades a garantir no gradle.properties, em ordem determinística.
 * @type {Array<[string, string]>}
 */
const GRADLE_PROPERTIES = [
  ['kotlin.compiler.execution.strategy', 'in-process'],
  ['org.gradle.daemon', 'false'],
  ['org.gradle.parallel', 'false'],
  // O compilador Kotlin in-process vive na MESMA JVM do Gradle: o default do
  // template (-Xmx2048m -XX:MaxMetaspaceSize=512m) estoura em build frio
  // completo — java.lang.OutOfMemoryError: Metaspace reproduzido em 17/07 com
  // home Gradle isolada + 4 ABIs (era a falha real por trás do "código 1"
  // suprimido do wrapper). Teto elevado cobre AGP + KGP + compilador embutido.
  ['org.gradle.jvmargs', '-Xmx3g -XX:MaxMetaspaceSize=1280m'],
];

/**
 * Garante (upsert idempotente) uma propriedade no array de modResults do
 * withGradleProperties.
 *
 * @param {Array<any>} properties
 * @param {string} key
 * @param {string} value
 * @returns {Array<any>}
 */
function upsertGradleProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === 'property' && item.key === key
  );

  if (existing) {
    existing.value = value;
    return properties;
  }

  properties.push({ type: 'property', key, value });
  return properties;
}

/**
 * @param {import('@expo/config-plugins').ExportedConfig} config
 * @returns {import('@expo/config-plugins').ExportedConfig}
 */
function withKotlinInProcess(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of GRADLE_PROPERTIES) {
      cfg.modResults = upsertGradleProperty(cfg.modResults, key, value);
    }
    return cfg;
  });
}

module.exports = withKotlinInProcess;
