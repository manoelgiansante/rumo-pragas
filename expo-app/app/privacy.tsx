import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../constants/theme';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const legalLanguageProps =
    Platform.OS === 'web'
      ? ({ lang: 'pt-BR' } as const)
      : ({ accessibilityLanguage: 'pt-BR' } as const);
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
        <Text style={styles.headerTitle} accessibilityRole="header" aria-level={1}>
          {t('privacy.headerTitle')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        {...legalLanguageProps}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Última atualização: 14 de julho de 2026</Text>

        <Text style={styles.intro}>
          Esta Política explica como a MM CAMPO FORTE LTDA., CNPJ 57.169.838/0001-20, responsável
          pelo Rumo Pragas sob a marca AgroRumo, trata dados pessoais no aplicativo. Aplicamos a Lei
          Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018) e os princípios de finalidade,
          necessidade, transparência, segurança e livre acesso.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          1. Dados tratados e finalidades
        </Text>
        <Text style={styles.paragraph}>
          Tratamos somente os dados necessários para oferecer, proteger e manter o serviço:
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
              <Text style={styles.bold}>Conta:</Text> nome, e-mail, identificador de autenticação e
              dados de sessão para criar a conta, autenticar, recuperar acesso e prestar suporte. A
              identidade de acesso AgroRumo pode ser compartilhada com outros produtos.
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
              <Text style={styles.bold}>Imagem enviada:</Text> a foto selecionada é processada para
              gerar a hipótese solicitada. O histórico atual salva o resultado estruturado, como
              hipótese, confiança e alternativas, sem gravar uma URL da foto nesse registro.
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
              <Text style={styles.bold}>Localização aproximada (opcional):</Text> coordenadas podem
              ser usadas, após a permissão do sistema, para consultar contexto meteorológico. A
              análise por foto também funciona sem essa permissão. Novos registros são minimizados
              para duas casas decimais.
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
              <Text style={styles.bold}>Histórico e conteúdo:</Text> resultados salvos, mensagens
              enviadas ao assistente e preferências necessárias para os recursos solicitados.
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
              <Text style={styles.bold}>Dados técnicos:</Text> token de notificação quando
              autorizado, versão do aplicativo, sistema, eventos de uso, desempenho e falhas
              necessários para entregar notificações, prevenir abuso e manter o serviço.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          2. Como usamos os dados
        </Text>
        <Text style={styles.paragraph}>
          Usamos esses dados para autenticar sua conta; processar a análise por foto e as mensagens
          do assistente; salvar o histórico solicitado; consultar o contexto meteorológico quando
          autorizado; entregar notificações opcionais; prestar suporte; prevenir abuso; corrigir
          falhas; e cumprir obrigações legais ou exercer direitos. Não vendemos nem alugamos dados
          pessoais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          3. Armazenamento e conservação
        </Text>
        <Text style={styles.paragraph}>
          Conta, histórico e dados necessários ao serviço usam a infraestrutura Supabase, com
          conexão protegida e controles de acesso por usuário. Sessão e preferências necessárias
          também podem ser mantidas no dispositivo. A foto é encaminhada pelo backend ao provedor
          ativo para processar a solicitação; o resultado estruturado atual não grava uma URL da
          foto. O tratamento realizado pelo provedor segue o contrato e a política aplicáveis.
          Conservamos cada categoria somente enquanto necessária à finalidade informada, a uma
          obrigação legal, à proteção de dados ou ao exercício regular de direitos.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          4. Provedores e compartilhamentos
        </Text>
        <Text style={styles.importantBox}>
          A análise por imagem usa o Agrio, da Saillog, como provedor padrão. O servidor pode
          selecionar o Anthropic Claude como alternativa. O assistente usa o Google Gemini como
          provedor padrão e o servidor pode selecionar o Anthropic Claude como alternativa. Em cada
          rota, enviamos ao provedor ativo a foto, mensagem e contexto estritamente necessários,
          somente depois do consentimento para IA.
        </Text>
        <Text style={styles.importantBox}>
          Quando você autoriza a localização, coordenadas aproximadas são enviadas ao Open-Meteo
          para retornar temperatura, umidade e precipitação; nome e e-mail não fazem parte dessa
          consulta. Supabase presta autenticação e backend, Sentry monitora falhas técnicas e Expo
          entrega notificações opcionais.
        </Text>
        <Text style={styles.paragraph}>
          O provedor ativo é definido no servidor. Não afirmamos retenção zero, processamento
          somente no Brasil ou ausência de uso para treinamento sem garantia contratual verificável.
          Alguns provedores podem processar dados fora do Brasil; nesses casos, limitamos o envio ao
          necessário e aplicamos os mecanismos de transferência internacional cabíveis. Também
          podemos compartilhar informações quando houver obrigação legal, ordem válida ou
          necessidade de exercício regular de direitos.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          5. Inteligência artificial
        </Text>
        <Text style={styles.importantBox}>
          A resposta da IA é probabilística e pode conter erros. Ela apresenta hipótese, confiança e
          alternativas, mas não substitui avaliação de campo, profissional habilitado ou receituário
          agronômico. Não use a resposta como indicação autônoma de produto, dose, mistura ou
          aplicação.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          6. Seus direitos (LGPD)
        </Text>
        <Text style={styles.paragraph}>Nos termos da LGPD, você pode solicitar, sem custo:</Text>
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
              <Text style={styles.bold}>Bloqueio ou eliminação:</Text> solicitar anonimização,
              bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em
              desconformidade, e eliminação quando cabível.
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
              <Text style={styles.bold}>Consentimento e oposição:</Text> receber informação sobre as
              consequências de não consentir, revogar o consentimento e se opor quando cabível.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          7. Segurança
        </Text>
        <Text style={styles.paragraph}>
          Adotamos conexão HTTPS, autenticação e autorização, isolamento de registros por usuário,
          armazenamento protegido de sessão no dispositivo, limites contra abuso e monitoramento
          técnico. Nenhum sistema é isento de risco; incidentes relevantes serão tratados e
          comunicados conforme a legislação e a regulamentação aplicáveis.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          8. Exclusão dos dados do Rumo Pragas
        </Text>
        <Text style={styles.paragraph}>
          Ao concluir a exclusão dentro do aplicativo, os dados específicos do Rumo Pragas são
          eliminados e os tokens push são revogados. A identidade global AgroRumo é compartilhada
          com outros produtos e não é apagada por essa ação específica. Registros históricos
          compartilhados sem um discriminador seguro de aplicativo também são mantidos para evitar a
          exclusão de dados pertencentes a outros produtos.
        </Text>
        <Text style={styles.paragraph}>
          Mantemos um marcador técnico mínimo de desvinculação: identificador global em formato
          UUID, estado operacional, número de tentativas, códigos técnicos limitados e datas do
          processamento. Ele não contém nome, e-mail, foto, mensagem, conteúdo ou token. Serve para
          repetir uma limpeza interrompida, comprovar a eliminação específica e impedir recriação
          silenciosa dos dados enquanto a identidade compartilhada continua ativa. Conforme o caso,
          esse tratamento se apoia no cumprimento da solicitação, em obrigações de proteção de dados
          e no exercício regular de direitos.
        </Text>
        <Text style={styles.paragraph}>
          O marcador permanece até a reativação explícita do Rumo Pragas ou a exclusão da identidade
          global AgroRumo. Reativar não recupera dados antigos. O aplicativo informa se a operação
          foi concluída, continua em processamento ou precisa ser tentada novamente. Cópias
          residuais tecnicamente necessárias, dados anonimizados e registros sujeitos às hipóteses
          do art. 16 da LGPD podem ser conservados somente para a finalidade cabível.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          9. Dados no dispositivo
        </Text>
        <Text style={styles.paragraph}>
          O aplicativo usa armazenamento local para sessão, consentimentos, preferências e filas
          necessárias ao funcionamento. Você pode apagar os dados locais pelas configurações do
          sistema; a exclusão dos dados do serviço deve ser concluída pelo fluxo próprio do
          aplicativo.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          10. Crianças e adolescentes
        </Text>
        <Text style={styles.paragraph}>
          O serviço não é direcionado a crianças. Se identificarmos tratamento incompatível com o
          melhor interesse de criança ou adolescente, adotaremos as medidas cabíveis e poderemos
          solicitar a atuação do responsável legal.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          11. Alterações nesta Política
        </Text>
        <Text style={styles.paragraph}>
          Podemos atualizar esta Política para refletir mudanças legais, técnicas ou operacionais. A
          data acima indica a versão vigente; mudanças materiais serão comunicadas por meio
          adequado.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          12. Controlador e canal de privacidade
        </Text>
        <Text style={styles.paragraph}>
          Controlador: MM CAMPO FORTE LTDA.{'\n'}CNPJ: 57.169.838/0001-20{'\n'}Canal do encarregado
          e dos titulares: contato@agrorumo.com{'\n\n'}Podemos solicitar dados mínimos para
          confirmar sua identidade e proteger a conta. Se a resposta não for satisfatória, você pode
          peticionar à ANPD ou procurar os órgãos de defesa do consumidor.
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
    fontFamily: FontFamily.semibold,
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
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.xxl,
  },
  intro: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.body,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.md,
  },
  paragraph: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  importantBox: {
    fontSize: FontSize.subheadline,
    color: Colors.techBlue,
    lineHeight: 22,
    backgroundColor: Colors.systemGray6,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.techBlue,
    marginBottom: Spacing.md,
    fontFamily: FontFamily.medium,
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
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 22,
  },
  bold: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
  },
  bottomSpacer: {
    height: 40,
  },
});
