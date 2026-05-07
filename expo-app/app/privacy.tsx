import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { AppBar, IconButton } from '../components/ui';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        title={t('privacy.headerTitle')}
        leading={
          <IconButton
            iconName="arrow-back"
            accessibilityLabel={t('privacy.backA11y')}
            onPress={() => router.back()}
          />
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Ultima atualizacao: 26 de marco de 2026</Text>

        <Text style={styles.intro}>
          A AgroRumo ("nos") se compromete a proteger a privacidade dos usuarios do aplicativo Rumo
          Pragas. Esta Politica de Privacidade descreve como coletamos, usamos, armazenamos e
          protegemos seus dados pessoais, em conformidade com a Lei Geral de Protecao de Dados (LGPD
          - Lei n. 13.709/2018).
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          1. Dados Coletados
        </Text>
        <Text style={styles.paragraph}>
          Coletamos os seguintes dados para fornecer e melhorar nossos servicos:
        </Text>
        <View style={styles.list}>
          <View style={styles.listItem}>
            <Ionicons
              name="mail-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Email:</Text> utilizado para autenticacao, comunicacao e
              recuperacao de conta.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="person-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Nome:</Text> utilizado para personalizacao da experiencia no
              aplicativo.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="location-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Localizacao (opcional):</Text> utilizada para
              georreferenciar diagnosticos e gerar relatorios com coordenadas da lavoura.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="camera-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Fotos de plantas:</Text> enviadas para analise por
              inteligencia artificial para identificacao de pragas, doencas e deficiencias.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="analytics-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Dados de uso:</Text> informacoes sobre como voce interage
              com o App (telas visitadas, funcionalidades utilizadas) para melhoria do servico.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          2. Como Usamos seus Dados
        </Text>
        <Text style={styles.paragraph}>
          Seus dados sao utilizados para:{'\n\n'}- Fornecer os servicos de diagnostico de pragas;
          {'\n'}- Personalizar sua experiencia no App;{'\n'}- Gerar relatorios e historico de
          diagnosticos;{'\n'}- Enviar comunicacoes sobre o servico (atualizacoes, novidades);{'\n'}-
          Melhorar nossos modelos de inteligencia artificial;{'\n'}- Cumprir obrigacoes legais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          3. Armazenamento de Dados
        </Text>
        <Text style={styles.paragraph}>
          Seus dados sao armazenados de forma segura utilizando a plataforma Supabase, com
          servidores protegidos por criptografia em transito (TLS) e em repouso. As imagens enviadas
          para analise sao armazenadas em buckets seguros com controle de acesso por usuario.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          4. Compartilhamento com Terceiros
        </Text>
        <Text style={styles.importantBox}>
          As imagens de plantas sao enviadas para o servico Claude, da Anthropic (inteligencia
          artificial), exclusivamente para fins de analise e diagnostico. Nenhum dado pessoal que
          identifique o usuario (nome, email, localizacao) e enviado junto com as imagens. A
          Anthropic processa as imagens de acordo com sua propria politica de privacidade e nao
          utiliza os dados enviados via API para treinar seus modelos.
        </Text>
        <Text style={styles.importantBox}>
          Suas coordenadas de localizacao (latitude e longitude), quando fornecidas, sao enviadas
          para o servico Open-Meteo para obter dados meteorologicos da sua regiao (temperatura,
          umidade, precipitacao). O Open-Meteo e um servico de dados climaticos abertos que nao
          requer autenticacao e nao armazena dados pessoais dos usuarios. Nenhuma informacao que
          identifique o usuario e transmitida junto com as coordenadas.
        </Text>
        <Text style={styles.paragraph}>
          Nao vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de
          marketing. Podemos compartilhar dados apenas nas seguintes situacoes:{'\n\n'}- Com
          provedores de servico essenciais (hospedagem, processamento de pagamentos);{'\n'}- Quando
          exigido por lei ou ordem judicial;{'\n'}- Para proteger nossos direitos legais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          5. Seus Direitos (LGPD)
        </Text>
        <Text style={styles.paragraph}>
          De acordo com a LGPD, voce tem os seguintes direitos sobre seus dados pessoais:
        </Text>
        <View style={styles.list}>
          <View style={styles.listItem}>
            <Ionicons
              name="checkmark-circle-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Confirmacao e acesso:</Text> saber se tratamos seus dados e
              obter uma copia.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="create-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Correcao:</Text> solicitar a correcao de dados incompletos
              ou desatualizados.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="trash-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Eliminacao:</Text> solicitar a exclusao de dados pessoais
              tratados com seu consentimento.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="download-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Portabilidade:</Text> solicitar a transferencia de seus
              dados para outro fornecedor.
            </Text>
          </View>
          <View style={styles.listItem}>
            <Ionicons
              name="hand-left-outline"
              size={16}
              color={Colors.accent}
              style={styles.listIcon}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={styles.listText}>
              <Text style={styles.bold}>Revogacao:</Text> revogar o consentimento a qualquer
              momento.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          6. Seguranca
        </Text>
        <Text style={styles.paragraph}>
          Implementamos medidas tecnicas e organizacionais para proteger seus dados, incluindo:
          {'\n\n'}- Criptografia de dados em transito e em repouso;{'\n'}- Autenticacao segura com
          tokens JWT;{'\n'}- Armazenamento de credenciais sensiveis em SecureStore;{'\n'}- Controle
          de acesso baseado em politicas (Row Level Security);{'\n'}- Monitoramento continuo de
          seguranca.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          7. Retencao de Dados
        </Text>
        <Text style={styles.paragraph}>
          Mantemos seus dados pessoais pelo tempo necessario para fornecer os servicos contratados
          ou conforme exigido por lei. Apos o encerramento da conta, seus dados serao eliminados em
          ate 30 dias, exceto quando houver obrigacao legal de retencao.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          8. Cookies e Tecnologias Similares
        </Text>
        <Text style={styles.paragraph}>
          O App pode utilizar tecnologias de rastreamento local (AsyncStorage) para manter
          preferencias do usuario e estado da sessao. Esses dados sao armazenados apenas no
          dispositivo do usuario.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          9. Alteracoes nesta Politica
        </Text>
        <Text style={styles.paragraph}>
          Podemos atualizar esta Politica de Privacidade periodicamente. Notificaremos voce sobre
          alteracoes significativas atraves do App. Recomendamos que revise esta politica
          regularmente.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          10. Contato e Encarregado de Dados
        </Text>
        <Text style={styles.paragraph}>
          Para exercer seus direitos ou esclarecer duvidas sobre o tratamento de seus dados
          pessoais, entre em contato conosco:{'\n\n'}
          Email: privacidade@agrorumo.com.br{'\n'}
          Encarregado de Dados (DPO): dpo@agrorumo.com.br
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  lastUpdated: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xxl,
  },
  intro: {
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
    letterSpacing: -0.26,
  },
  paragraph: {
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  importantBox: {
    fontSize: FontSize.subheadline,
    color: Colors.accentDark,
    lineHeight: 22,
    backgroundColor: Colors.accent + '0D',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    marginBottom: Spacing.md,
    fontWeight: FontWeight.medium,
    overflow: 'hidden',
  },
  list: {
    marginBottom: Spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  listIcon: {
    marginRight: Spacing.md,
    marginTop: 2,
  },
  listText: {
    flex: 1,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
  },
  bold: {
    fontWeight: FontWeight.semibold,
  },
  bottomSpacer: {
    height: 40,
  },
});
