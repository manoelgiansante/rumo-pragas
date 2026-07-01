import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

export default function TermsScreen() {
  const { t } = useTranslation();
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
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('terms.headerTitle')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Última atualização: 1 de julho de 2026</Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          1. Aceitação dos Termos
        </Text>
        <Text style={styles.paragraph}>
          Ao acessar e utilizar o aplicativo Rumo Pragas IA ("App"), você concorda com estes Termos
          de Uso. Caso não concorde com algum dos termos aqui descritos, por favor, não utilize o
          App.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          2. Descrição do Serviço
        </Text>
        <Text style={styles.paragraph}>
          O Rumo Pragas IA é um aplicativo de diagnóstico inteligente de pragas agrícolas que
          utiliza inteligência artificial para analisar imagens de plantas e identificar possíveis
          pragas, doenças e deficiências nutricionais. O App oferece funcionalidades como captura e
          envio de fotos, histórico de diagnósticos, chat com IA especializada e relatórios.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          3. Uso do Aplicativo
        </Text>
        <Text style={styles.paragraph}>
          Você se compromete a utilizar o App de forma responsável e em conformidade com a
          legislação vigente. É proibido:{'\n\n'}- Utilizar o App para fins ilegais ou não
          autorizados;{'\n'}- Tentar acessar áreas restritas do sistema;{'\n'}- Compartilhar sua
          conta com terceiros;{'\n'}- Reproduzir, distribuir ou modificar o conteúdo do App sem
          autorização.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          4. Diagnósticos Informativos
        </Text>
        <Text style={styles.importantBox}>
          Os diagnósticos fornecidos pelo Rumo Pragas IA são meramente informativos e baseados em
          modelos de inteligência artificial. Eles NÃO substituem a avaliação de um engenheiro
          agrônomo ou profissional habilitado. Recomendamos que todo diagnóstico seja validado por
          um profissional antes de qualquer tomada de decisão sobre manejo, aplicação de defensivos
          ou tratamento de culturas.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          5. Responsabilidades do Usuário
        </Text>
        <Text style={styles.paragraph}>
          O usuário é responsável por:{'\n\n'}- Manter a confidencialidade de suas credenciais de
          acesso;{'\n'}- Garantir a qualidade das imagens enviadas para análise;{'\n'}- Validar os
          diagnósticos com profissionais qualificados antes de agir;{'\n'}- Manter seus dados
          cadastrais atualizados.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          6. Limitação de Responsabilidade
        </Text>
        <Text style={styles.paragraph}>
          A AgroRumo não se responsabiliza por danos diretos, indiretos, incidentais ou consequentes
          decorrentes do uso dos diagnósticos fornecidos pelo App. A precisão dos diagnósticos
          depende de diversos fatores, incluindo qualidade da imagem, estágio da praga e condições
          ambientais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          7. Propriedade Intelectual
        </Text>
        <Text style={styles.paragraph}>
          Todo o conteúdo do App, incluindo mas não se limitando a textos, gráficos, logotipos,
          ícones, imagens, modelos de IA e software, é de propriedade exclusiva da AgroRumo ou de
          seus licenciadores e é protegido pelas leis de propriedade intelectual aplicáveis.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          8. Dados e Privacidade
        </Text>
        <Text style={styles.paragraph}>
          A coleta e o tratamento de dados pessoais são regidos pela nossa Política de Privacidade,
          que complementa estes Termos de Uso. Ao utilizar o App, você também concorda com a
          Política de Privacidade.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          9. Planos
        </Text>
        <Text style={styles.paragraph}>
          O App é oferecido gratuitamente, com todas as funcionalidades disponíveis sem custo. No
          momento não há assinatura, compra dentro do aplicativo nem qualquer cobrança. Caso planos
          pagos venham a ser oferecidos no futuro, os detalhes — incluindo preços, forma de
          renovação e cancelamento — serão apresentados de forma clara no próprio App e na
          respectiva loja (App Store / Google Play), e nenhuma cobrança será realizada sem o seu
          consentimento expresso, respeitado o direito de arrependimento previsto no art. 49 do
          Código de Defesa do Consumidor.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          10. Cancelamento e Encerramento
        </Text>
        <Text style={styles.paragraph}>
          Você pode encerrar sua conta e excluir todos os seus dados a qualquer momento diretamente
          no aplicativo, em Ajustes {'>'} Excluir conta, ou pela página
          https://pragas.agrorumo.com/delete-account. A exclusão é imediata e irreversível. A
          AgroRumo reserva-se o direito de suspender ou encerrar contas que violem estes Termos de
          Uso, sem aviso prévio.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          11. Alterações nos Termos
        </Text>
        <Text style={styles.paragraph}>
          A AgroRumo pode alterar estes Termos de Uso a qualquer momento. As alterações serão
          comunicadas pelo App e entrarão em vigor na data de publicação. O uso continuado do App
          após as alterações constitui aceitação dos novos termos.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          12. Contato
        </Text>
        <Text style={styles.paragraph}>
          Em caso de dúvidas sobre estes Termos de Uso, entre em contato conosco pelo email:
          contato@agrorumo.com
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          13. Contato Legal
        </Text>
        <Text style={styles.paragraph}>
          Razão Social: MM CAMPO FORTE LTDA.{'\n'}
          CNPJ: 57.169.838/0001-20{'\n'}
          Email: contato@agrorumo.com{'\n'}
          Encarregado de Proteção de Dados (DPO): contato@agrorumo.com
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          14. Lei Aplicável e Foro
        </Text>
        <Text style={styles.paragraph}>
          Este Termo é regido pelas leis da República Federativa do Brasil, incluindo o Código de
          Defesa do Consumidor (Lei 8.078/1990) e a LGPD (Lei 13.709/2018). Fica eleito o foro da
          Comarca de Ribeirão Preto - SP para dirimir quaisquer disputas, renunciando as partes a
          qualquer outro, por mais privilegiado que seja.
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
    color: Colors.coral,
    lineHeight: 22,
    backgroundColor: '#FFF3F0',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.coral,
    marginBottom: Spacing.md,
    fontWeight: FontWeight.medium,
    overflow: 'hidden',
  },
  bottomSpacer: {
    height: 40,
  },
});
