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

export default function TermsScreen() {
  const { t } = useTranslation();
  const legalLanguageProps =
    Platform.OS === 'web'
      ? ({ lang: 'pt-BR' } as const)
      : ({ accessibilityLanguage: 'pt-BR' } as const);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="terms-back"
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('terms.backA11y')}
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
          {t('terms.headerTitle')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        {...legalLanguageProps}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Última atualização: 16 de julho de 2026</Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          1. Aceitação dos Termos
        </Text>
        <Text style={styles.paragraph}>
          O Rumo Pragas é oferecido pela MM CAMPO FORTE LTDA., CNPJ 57.169.838/0001-20, sob a marca
          AgroRumo. Ao usar o aplicativo, você concorda com estes Termos e com a Política de
          Privacidade.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          2. Descrição do Serviço
        </Text>
        <Text style={styles.paragraph}>
          O aplicativo recebe uma foto e apresenta hipótese probabilística de identificação, nível
          de confiança e possíveis alternativas. Também oferece histórico estruturado, biblioteca
          educativa e assistente de IA para organizar informações gerais. A análise por foto e o
          assistente exigem internet; uma solicitação interrompida pode ficar em fila local para
          nova tentativa quando a conexão retornar. Não há inferência offline.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          3. Uso do Aplicativo
        </Text>
        <Text style={styles.paragraph}>
          Você deve fornecer dados corretos, proteger suas credenciais e usar o aplicativo de forma
          responsável. É proibido:{'\n\n'}- Usar o serviço para atividade ilegal, fraude ou violação
          de direitos;{'\n'}- Tentar contornar autenticação, autorização, limites técnicos ou
          controles de segurança;{'\n'}- Introduzir código malicioso, automatizar abuso ou
          sobrecarregar a infraestrutura;{'\n'}- Usar a saída da IA como laudo, receita ou decisão
          profissional definitiva.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          4. Diagnósticos Informativos
        </Text>
        <Text style={styles.importantBox}>
          Os resultados são informativos, probabilísticos e podem estar incorretos ou incompletos.
          Eles não substituem avaliação de campo ou profissional habilitado. O Rumo Pragas não emite
          receituário agronômico e não prescreve produto, dose, mistura, intervalo ou forma de
          aplicação. Confirme o registro e as condições oficiais no AGROFIT e siga a orientação do
          profissional responsável antes de qualquer decisão de manejo.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          5. Responsabilidades do Usuário
        </Text>
        <Text style={styles.paragraph}>
          A análise depende da qualidade e iluminação da imagem, do estágio da planta, de sintomas
          semelhantes e das condições locais. Você é responsável por revisar a informação e buscar
          avaliação habilitada antes de agir. A identidade de acesso AgroRumo pode ser compartilhada
          entre produtos, enquanto os dados específicos do Rumo Pragas permanecem separados conforme
          as permissões aplicáveis.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          6. Limitação de Responsabilidade
        </Text>
        <Text style={styles.paragraph}>
          Trabalhamos para manter o serviço seguro e disponível, mas podem ocorrer manutenção,
          falhas de conexão ou indisponibilidade de terceiros. Nada nestes Termos exclui direitos ou
          responsabilidades que não possam ser afastados pela legislação brasileira. Dentro dos
          limites legais, o usuário deve validar as informações antes de agir.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          7. Propriedade Intelectual
        </Text>
        <Text style={styles.paragraph}>
          Marca, interface, código e conteúdo próprio pertencem à MM CAMPO FORTE LTDA. ou a seus
          licenciadores. Você mantém os direitos sobre o conteúdo que envia e nos concede somente a
          autorização necessária para processá-lo e prestar a funcionalidade solicitada.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          8. Dados e Privacidade
        </Text>
        <Text style={styles.paragraph}>
          A coleta e o tratamento de dados pessoais são regidos pela Política de Privacidade, que
          informa as finalidades, provedores, conservação, exclusão da conta e direitos do titular.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          9. Serviço gratuito
        </Text>
        <Text style={styles.paragraph}>
          O Rumo Pragas é gratuito e não oferece plano pago, assinatura, compra interna ou período
          de teste. Podem existir limites técnicos e de uso justo para proteger a disponibilidade do
          serviço.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          10. Exclusão de dados e encerramento do uso
        </Text>
        <Text style={styles.paragraph}>
          Pela opção de exclusão em Ajustes, você solicita a exclusão da conta AgroRumo inteira, que
          pode ser compartilhada com outros produtos. Antes de registrar o pedido, o aplicativo
          informa esse alcance, exige confirmação expressa e solicita nova autenticação pelo mesmo
          titular. Contas vinculadas ao Iniciar Sessão com Apple exigem confirmação com a Apple para
          que a autorização correspondente seja revogada com segurança. O pedido e o recibo são
          registrados antes dessa chamada externa; indisponibilidade temporária da Apple mantém a
          revogação pendente na fila auditada e não cancela a exclusão.
        </Text>
        <Text style={styles.paragraph}>
          Quando o servidor aceita o pedido, o acesso ao Rumo Pragas é suspenso, os tokens push são
          revogados e o vínculo não pode ser reativado. A exclusão ou anonimização coordenada dos
          dados dos produtos e da identidade de autenticação é concluída em até 15 dias, salvo
          retenção específica permitida por lei. O recibo opaco permite acompanhar o estado sem
          expor nome, e-mail, telefone ou UUID bruto. A conclusão é comunicada ao titular.
        </Text>
        <Text style={styles.paragraph}>
          A fila técnica e o registro de auditoria mantêm somente referências HMAC, estados, datas e
          códigos limitados necessários para executar e comprovar o pedido. Dados anonimizados e
          registros sujeitos às hipóteses legais de conservação podem permanecer apenas pela
          finalidade e pelo prazo aplicáveis. Também há orientação em
          pragas.agrorumo.com/excluir-conta.
        </Text>
        <Text style={styles.paragraph}>
          Podemos restringir uso abusivo, ilegal ou que comprometa a segurança, respeitada a
          legislação aplicável.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          11. Alterações nos Termos
        </Text>
        <Text style={styles.paragraph}>
          Estes Termos podem ser atualizados para refletir mudanças legais, técnicas ou
          operacionais. A data acima indica a versão vigente; mudanças materiais serão comunicadas
          por meio adequado.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={2}>
          12. Lei aplicável e contato
        </Text>
        <Text style={styles.paragraph}>
          Aplica-se a legislação brasileira, inclusive o Código de Defesa do Consumidor e a LGPD.
          Direitos de foro previstos em lei permanecem preservados.{'\n\n'}Controlador: MM CAMPO
          FORTE LTDA.{'\n'}CNPJ: 57.169.838/0001-20{'\n'}Contato e canal de privacidade:
          contato@agrorumo.com
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
    color: Colors.coral,
    lineHeight: 22,
    backgroundColor: '#FFF3F0',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.coral,
    marginBottom: Spacing.md,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    overflow: 'hidden',
  },
  bottomSpacer: {
    height: 40,
  },
});
