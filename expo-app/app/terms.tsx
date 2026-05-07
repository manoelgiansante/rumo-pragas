import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { AppBar, IconButton } from '../components/ui';

export default function TermsScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        title={t('terms.headerTitle')}
        leading={
          <IconButton
            iconName="arrow-back"
            accessibilityLabel={t('terms.backA11y')}
            onPress={() => router.back()}
          />
        }
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Ultima atualizacao: 25 de marco de 2026</Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          1. Aceitacao dos Termos
        </Text>
        <Text style={styles.paragraph}>
          Ao acessar e utilizar o aplicativo Rumo Praga ("App"), voce concorda com estes Termos de
          Uso. Caso nao concorde com algum dos termos aqui descritos, por favor, nao utilize o App.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          2. Descricao do Servico
        </Text>
        <Text style={styles.paragraph}>
          O Rumo Praga e um aplicativo de diagnostico inteligente de pragas agricolas que utiliza
          inteligencia artificial para analisar imagens de plantas e identificar possiveis pragas,
          doencas e deficiencias nutricionais. O App oferece funcionalidades como captura e envio de
          fotos, historico de diagnosticos, chat com IA especializada e relatorios.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          3. Uso do Aplicativo
        </Text>
        <Text style={styles.paragraph}>
          Voce se compromete a utilizar o App de forma responsavel e em conformidade com a
          legislacao vigente. E proibido:{'\n\n'}- Utilizar o App para fins ilegais ou nao
          autorizados;{'\n'}- Tentar acessar areas restritas do sistema;{'\n'}- Compartilhar sua
          conta com terceiros;{'\n'}- Reproduzir, distribuir ou modificar o conteudo do App sem
          autorizacao.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          4. Diagnosticos Informativos
        </Text>
        <Text style={styles.importantBox}>
          Os diagnosticos fornecidos pelo Rumo Praga sao meramente informativos e baseados em
          modelos de inteligencia artificial. Eles NAO substituem a avaliacao de um engenheiro
          agronomo ou profissional habilitado. Recomendamos que todo diagnostico seja validado por
          um profissional antes de qualquer tomada de decisao sobre manejo, aplicacao de defensivos
          ou tratamento de culturas.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          5. Responsabilidades do Usuario
        </Text>
        <Text style={styles.paragraph}>
          O usuario e responsavel por:{'\n\n'}- Manter a confidencialidade de suas credenciais de
          acesso;{'\n'}- Garantir a qualidade das imagens enviadas para analise;{'\n'}- Validar os
          diagnosticos com profissionais qualificados antes de agir;{'\n'}- Manter seus dados
          cadastrais atualizados.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          6. Limitacao de Responsabilidade
        </Text>
        <Text style={styles.paragraph}>
          A AgroRumo nao se responsabiliza por danos diretos, indiretos, incidentais ou consequentes
          decorrentes do uso dos diagnosticos fornecidos pelo App. A precisao dos diagnosticos
          depende de diversos fatores, incluindo qualidade da imagem, estagio da praga e condicoes
          ambientais.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          7. Propriedade Intelectual
        </Text>
        <Text style={styles.paragraph}>
          Todo o conteudo do App, incluindo mas nao se limitando a textos, graficos, logotipos,
          icones, imagens, modelos de IA e software, e de propriedade exclusiva da AgroRumo ou de
          seus licenciadores e e protegido pelas leis de propriedade intelectual aplicaveis.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          8. Dados e Privacidade
        </Text>
        <Text style={styles.paragraph}>
          A coleta e o tratamento de dados pessoais sao regidos pela nossa Politica de Privacidade,
          que complementa estes Termos de Uso. Ao utilizar o App, voce tambem concorda com a
          Politica de Privacidade.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          9. Planos e Assinatura
        </Text>
        <Text style={styles.paragraph}>
          O App oferece um plano gratuito com funcionalidades limitadas e planos pagos com recursos
          adicionais. Os detalhes de cada plano, incluindo precos e funcionalidades, estao
          disponiveis na secao de assinatura do App. O cancelamento pode ser feito a qualquer
          momento, mas nao gera direito a reembolso proporcional do periodo ja pago.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          10. Cancelamento e Encerramento
        </Text>
        <Text style={styles.paragraph}>
          Voce pode encerrar sua conta a qualquer momento entrando em contato com nosso suporte. A
          AgroRumo reserva-se o direito de suspender ou encerrar contas que violem estes Termos de
          Uso, sem aviso previo.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          11. Alteracoes nos Termos
        </Text>
        <Text style={styles.paragraph}>
          A AgroRumo pode alterar estes Termos de Uso a qualquer momento. As alteracoes serao
          comunicadas pelo App e entrarao em vigor na data de publicacao. O uso continuado do App
          apos as alteracoes constitui aceitacao dos novos termos.
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          12. Contato
        </Text>
        <Text style={styles.paragraph}>
          Em caso de duvidas sobre estes Termos de Uso, entre em contato conosco pelo email:
          contato@agrorumo.com.br
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          14. Contato Legal
        </Text>
        <Text style={styles.paragraph}>
          Razao Social: AgroRumo (Manoel Nascimento - Pessoa Fisica){'\n'}
          CNPJ: Em processo de registro como MEI{'\n'}
          Email: contato@agrorumo.com.br{'\n'}
          DPO: dpo@agrorumo.com.br
        </Text>

        <Text style={styles.sectionTitle} accessibilityRole="header">
          15. Lei Aplicavel e Foro
        </Text>
        <Text style={styles.paragraph}>
          Este Termo e regido pelas leis da Republica Federativa do Brasil, incluindo o Codigo de
          Defesa do Consumidor (Lei 8.078/1990) e a LGPD (Lei 13.709/2018). Fica eleito o foro da
          Comarca de Ribeirao Preto - SP para dirimir quaisquer disputas, renunciando as partes a
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
