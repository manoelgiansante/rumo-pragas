import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="privacy-back"
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('privacy.backA11y')}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={Colors.accent}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('privacy.headerTitle')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Última atualização: 1 de julho de 2026</Text>

        <Text style={styles.intro}>
          A AgroRumo ("nós") se compromete a proteger a privacidade dos usuários do aplicativo Rumo
          Pragas IA. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e
          protegemos seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD
          - Lei n. 13.709/2018).
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          1. Dados Coletados
        </Text>
        <Text style={styles.paragraph}>
          Coletamos os seguintes dados para fornecer e melhorar nossos serviços:
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
              <Text style={styles.bold}>Email:</Text> utilizado para autenticação, comunicação e
              recuperação de conta.
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
              <Text style={styles.bold}>Nome:</Text> utilizado para personalização da experiência no
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
              <Text style={styles.bold}>Localização (opcional):</Text> utilizada para
              georreferenciar diagnósticos e gerar relatórios com coordenadas da lavoura.
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
              <Text style={styles.bold}>Fotos de plantas:</Text> enviadas para análise por
              inteligência artificial para identificação de pragas, doenças e deficiências.
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
              <Text style={styles.bold}>Dados de uso:</Text> informações sobre como você interage
              com o App (telas visitadas, funcionalidades utilizadas) para melhoria do serviço.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          2. Como Usamos seus Dados
        </Text>
        <Text style={styles.paragraph}>
          Seus dados são utilizados para:{'\n\n'}- Fornecer os serviços de diagnóstico de pragas;
          {'\n'}- Personalizar sua experiência no App;{'\n'}- Gerar relatórios e histórico de
          diagnósticos;{'\n'}- Enviar comunicações sobre o serviço (atualizações, novidades);{'\n'}-
          Melhorar nossos modelos de inteligência artificial;{'\n'}- Cumprir obrigações legais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          3. Armazenamento de Dados
        </Text>
        <Text style={styles.paragraph}>
          Seus dados são armazenados de forma segura utilizando a plataforma Supabase, com
          servidores protegidos por criptografia em trânsito (TLS) e em repouso. As imagens enviadas
          para análise são armazenadas em buckets seguros com controle de acesso por usuário.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          4. Compartilhamento com Terceiros
        </Text>
        <Text style={styles.importantBox}>
          As imagens de plantas são enviadas, por meio do nosso servidor de diagnóstico, ao serviço
          Claude, da Anthropic (inteligência artificial), exclusivamente para fins de análise e
          diagnóstico. Quando você autoriza o uso da localização, as coordenadas (latitude e
          longitude) são enviadas no mesmo pedido de diagnóstico e utilizadas apenas como contexto
          regional (condições climáticas e ocorrência de pragas na sua região) para melhorar o
          resultado. Se você não autorizar a localização, nenhuma coordenada é enviada
          (comportamento restritivo por padrão). Seu nome e email NÃO são enviados junto com as
          imagens. A Anthropic processa os dados de acordo com sua própria política de privacidade e
          não utiliza os dados enviados via API para treinar seus modelos.
        </Text>
        <Text style={styles.importantBox}>
          Suas coordenadas de localização (latitude e longitude), quando fornecidas, são enviadas
          para o serviço Open-Meteo para obter dados meteorológicos da sua região (temperatura,
          umidade, precipitação). O Open-Meteo é um serviço de dados climáticos abertos que não
          requer autenticação e não armazena dados pessoais dos usuários. Nenhuma informação que
          identifique o usuário é transmitida junto com as coordenadas.
        </Text>
        <Text style={styles.paragraph}>
          Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de
          marketing. Podemos compartilhar dados apenas nas seguintes situações:{'\n\n'}- Com
          provedores de serviço essenciais (hospedagem, processamento de pagamentos);{'\n'}- Quando
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
              <Text style={styles.bold}>Confirmação e acesso:</Text> saber se tratamos seus dados e
              obter uma cópia.
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
              <Text style={styles.bold}>Correção:</Text> solicitar a correção de dados incompletos
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
              <Text style={styles.bold}>Eliminação:</Text> solicitar a exclusão de dados pessoais
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
              <Text style={styles.bold}>Portabilidade:</Text> solicitar a transferência de seus
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
              <Text style={styles.bold}>Revogação:</Text> revogar o consentimento a qualquer
              momento.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          6. Segurança
        </Text>
        <Text style={styles.paragraph}>
          Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
          {'\n\n'}- Criptografia de dados em trânsito e em repouso;{'\n'}- Autenticação segura com
          tokens JWT;{'\n'}- Armazenamento de credenciais sensíveis em SecureStore;{'\n'}- Controle
          de acesso baseado em políticas (Row Level Security);{'\n'}- Monitoramento contínuo de
          segurança.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          7. Retenção de Dados
        </Text>
        <Text style={styles.paragraph}>
          Mantemos seus dados pessoais pelo tempo necessário para fornecer os serviços contratados
          ou conforme exigido por lei. Ao solicitar a exclusão da conta no aplicativo, sua conta e
          seus dados são eliminados imediatamente, exceto quando houver obrigação legal de retenção.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          8. Cookies e Tecnologias Similares
        </Text>
        <Text style={styles.paragraph}>
          O App pode utilizar tecnologias de rastreamento local (AsyncStorage) para manter
          preferências do usuário e estado da sessão. Esses dados são armazenados apenas no
          dispositivo do usuário.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          9. Alterações nesta Política
        </Text>
        <Text style={styles.paragraph}>
          Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos você sobre
          alterações significativas através do App. Recomendamos que revise esta política
          regularmente.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          10. Controlador e Encarregado de Dados (DPO)
        </Text>
        <Text style={styles.paragraph}>
          O controlador dos seus dados pessoais é a MM CAMPO FORTE LTDA., inscrita no CNPJ sob o n.
          57.169.838/0001-20, que opera o aplicativo Rumo Pragas IA sob a marca AgroRumo.{'\n\n'}A
          MM CAMPO FORTE LTDA. designou um Encarregado de Proteção de Dados (DPO), responsável por
          receber e atender as solicitações dos titulares, que serão respondidas em até 15 dias.
          {'\n\n'}
          Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de seus dados
          pessoais, entre em contato com o Encarregado (DPO):{'\n\n'}
          Email: contato@agrorumo.com
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.xl,
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
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  paragraph: {
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  importantBox: {
    fontSize: FontSize.subheadline,
    color: Colors.techBlue,
    lineHeight: 22,
    backgroundColor: '#EEF4FF',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.techBlue,
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
