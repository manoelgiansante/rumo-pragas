import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Termos de Uso</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Ultima atualizacao: 25 de marco de 2026</Text>

        <Text style={styles.sectionTitle}>1. Aceitacao dos Termos</Text>
        <Text style={styles.paragraph}>
          Ao acessar e utilizar o aplicativo Rumo Pragas ("App"), voce concorda com estes Termos de
          Uso. Caso nao concorde com algum dos termos aqui descritos, por favor, nao utilize o App.
        </Text>

        <Text style={styles.sectionTitle}>2. Descricao do Servico</Text>
        <Text style={styles.paragraph}>
          O Rumo Pragas e um aplicativo de diagnostico inteligente de pragas agricolas que utiliza
          inteligencia artificial para analisar imagens de plantas e identificar possiveis pragas,
          doencas e deficiencias nutricionais. O App oferece funcionalidades como captura e envio de
          fotos, historico de diagnosticos, chat com IA especializada e relatorios.
        </Text>

        <Text style={styles.sectionTitle}>3. Uso do Aplicativo</Text>
        <Text style={styles.paragraph}>
          Voce se compromete a utilizar o App de forma responsavel e em conformidade com a
          legislacao vigente. E proibido:{'\n\n'}- Utilizar o App para fins ilegais ou nao
          autorizados;{'\n'}- Tentar acessar areas restritas do sistema;{'\n'}- Compartilhar sua
          conta com terceiros;{'\n'}- Reproduzir, distribuir ou modificar o conteudo do App sem
          autorizacao.
        </Text>

        <Text style={styles.sectionTitle}>4. Diagnosticos Informativos</Text>
        <Text style={styles.importantBox}>
          Os diagnosticos fornecidos pelo Rumo Pragas sao meramente informativos e baseados em
          modelos de inteligencia artificial. Eles NAO substituem a avaliacao de um engenheiro
          agronomo ou profissional habilitado. Recomendamos que todo diagnostico seja validado por
          um profissional antes de qualquer tomada de decisao sobre manejo, aplicacao de defensivos
          ou tratamento de culturas.
        </Text>

        <Text style={styles.sectionTitle}>5. Responsabilidades do Usuario</Text>
        <Text style={styles.paragraph}>
          O usuario e responsavel por:{'\n\n'}- Manter a confidencialidade de suas credenciais de
          acesso;{'\n'}- Garantir a qualidade das imagens enviadas para analise;{'\n'}- Validar os
          diagnosticos com profissionais qualificados antes de agir;{'\n'}- Manter seus dados
          cadastrais atualizados.
        </Text>

        <Text style={styles.sectionTitle}>6. Limitacao de Responsabilidade</Text>
        <Text style={styles.paragraph}>
          A AgroRumo nao se responsabiliza por danos diretos, indiretos, incidentais ou consequentes
          decorrentes do uso dos diagnosticos fornecidos pelo App. A precisao dos diagnosticos
          depende de diversos fatores, incluindo qualidade da imagem, estagio da praga e condicoes
          ambientais.
        </Text>

        <Text style={styles.sectionTitle}>7. Propriedade Intelectual</Text>
        <Text style={styles.paragraph}>
          Todo o conteudo do App, incluindo mas nao se limitando a textos, graficos, logotipos,
          icones, imagens, modelos de IA e software, e de propriedade exclusiva da AgroRumo ou de
          seus licenciadores e e protegido pelas leis de propriedade intelectual aplicaveis.
        </Text>

        <Text style={styles.sectionTitle}>8. Dados e Privacidade</Text>
        <Text style={styles.paragraph}>
          A coleta e o tratamento de dados pessoais sao regidos pela nossa Politica de Privacidade,
          que complementa estes Termos de Uso. Ao utilizar o App, voce tambem concorda com a
          Politica de Privacidade.
        </Text>

        <Text style={styles.sectionTitle}>9. Planos e Assinatura</Text>
        <Text style={styles.paragraph}>
          O App oferece um plano gratuito com funcionalidades limitadas e planos pagos com recursos
          adicionais. Os detalhes de cada plano, incluindo precos e funcionalidades, estao
          disponiveis na secao de assinatura do App. O cancelamento pode ser feito a qualquer
          momento, mas nao gera direito a reembolso proporcional do periodo ja pago.
        </Text>

        <Text style={styles.sectionTitle}>10. Cancelamento e Encerramento</Text>
        <Text style={styles.paragraph}>
          Voce pode encerrar sua conta a qualquer momento entrando em contato com nosso suporte. A
          AgroRumo reserva-se o direito de suspender ou encerrar contas que violem estes Termos de
          Uso, sem aviso previo.
        </Text>

        <Text style={styles.sectionTitle}>11. Alteracoes nos Termos</Text>
        <Text style={styles.paragraph}>
          A AgroRumo pode alterar estes Termos de Uso a qualquer momento. As alteracoes serao
          comunicadas pelo App e entrarao em vigor na data de publicacao. O uso continuado do App
          apos as alteracoes constitui aceitacao dos novos termos.
        </Text>

        <Text style={styles.sectionTitle}>12. Contato</Text>
        <Text style={styles.paragraph}>
          Em caso de duvidas sobre estes Termos de Uso, entre em contato conosco pelo email:
          contato@agrorumo.com.br
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
