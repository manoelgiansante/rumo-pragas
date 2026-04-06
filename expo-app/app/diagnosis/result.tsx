import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { trackSuccessfulDiagnosis } from '../../services/storeReview';

export default function ResultScreen() {
  const { t } = useTranslation();
  const { data, error, queued } = useLocalSearchParams<{
    data?: string;
    error?: string;
    queued?: string;
  }>();

  // Parse result data upfront (before any hooks) to avoid conditional hook calls
  let result: any = {};
  try {
    result = JSON.parse(data || '{}');
  } catch {}

  const isHealthy =
    !result.pest_name ||
    result.pest_name?.toLowerCase().includes('healthy') ||
    result.pest_id === 'Healthy';
  const confidence = result.confidence ?? 0;

  const parseNotes = () => {
    try {
      if (result.parsedNotes) return result.parsedNotes;
      if (typeof result.notes === 'string') return JSON.parse(result.notes);
      return result.notes || {};
    } catch {
      return {};
    }
  };
  const notes = parseNotes();
  const enrichment = notes.enrichment || {};

  const getSeverityColor = () => {
    const severity = enrichment?.severity;
    if (severity === 'critical') return '#D32F2F';
    if (severity === 'high') return Colors.coral;
    if (severity === 'medium') return Colors.warmAmber;
    if (severity === 'low' || severity === 'none' || isHealthy) return Colors.accent;
    if (confidence > 0.7) return Colors.coral;
    if (confidence > 0.4) return Colors.warmAmber;
    return Colors.accent;
  };
  const severityColor = getSeverityColor();

  const severityLabel = () => {
    const s = enrichment?.severity;
    if (s === 'critical') return t('severity.critical');
    if (s === 'high') return t('severity.high');
    if (s === 'medium') return t('severity.medium');
    if (s === 'low') return t('severity.low');
    if (s === 'none' || isHealthy) return t('severity.none');
    return t('severity.undefined');
  };

  // Track successful diagnosis for store review prompt
  // Hook is called unconditionally (React rules of hooks) but logic is guarded
  useEffect(() => {
    if (!error && !queued && result.pest_name) {
      trackSuccessfulDiagnosis();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Early returns AFTER all hooks have been called
  if (queued === 'true') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.warmAmber + '1F' }]}>
            <Ionicons name="cloud-upload-outline" size={44} color={Colors.warmAmber} />
          </View>
          <Text style={styles.errorTitle}>{t('diagnosis.queued')}</Text>
          <Text style={styles.errorMsg}>{t('diagnosis.queuedMessage')}</Text>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: Colors.warmAmber }]}
            onPress={() => router.dismissAll()}
            accessibilityLabel="Voltar para a tela inicial"
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.backToHome')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.coral + '1F' }]}>
            <Ionicons
              name="warning"
              size={44}
              color={Colors.coral}
              accessibilityLabel="Icone de erro"
              accessibilityRole="image"
            />
          </View>
          <Text style={styles.errorTitle}>{t('diagnosis.error')}</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.dismissAll()}
            accessibilityLabel="Fechar diagnostico"
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.close')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state: no valid diagnosis data received
  if (!data || (!result.pest_name && !result.pest_id)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.systemGray5 }]}>
            <Ionicons name="document-text-outline" size={44} color={Colors.systemGray} />
          </View>
          <Text style={styles.errorTitle}>{t('diagnosis.noData')}</Text>
          <Text style={styles.errorMsg}>{t('diagnosis.noDataMsg')}</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.replace('/diagnosis/camera')}
            accessibilityLabel={t('diagnosis.newDiagnosis')}
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.newDiagnosis')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const buildShareText = useCallback(() => {
    const pestName = isHealthy
      ? t('diagnosis.healthy')
      : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected');
    const conf = Math.round(confidence * 100);
    const crop = result.crop || t('diagnosis.notInformed');
    const severity = severityLabel();

    const symptoms = enrichment.symptoms?.length
      ? enrichment.symptoms.map((s: string) => `  - ${s}`).join('\n')
      : `  ${t('diagnosis.noSymptomsRecorded')}`;

    const treatments: string[] = [];
    if (enrichment.cultural_treatment?.length) {
      treatments.push(`*${t('diagnosis.shareCulturalControl')}:*`);
      enrichment.cultural_treatment.forEach((tr: string) => treatments.push(`  - ${tr}`));
    }
    if (enrichment.chemical_treatment?.length) {
      treatments.push(`*${t('diagnosis.shareChemicalControl')}:*`);
      enrichment.chemical_treatment.forEach((tr: string) => treatments.push(`  - ${tr}`));
    }
    if (enrichment.biological_treatment?.length) {
      treatments.push(`*${t('diagnosis.shareBiologicalControl')}:*`);
      enrichment.biological_treatment.forEach((tr: string) => treatments.push(`  - ${tr}`));
    }
    const treatmentText =
      treatments.length > 0 ? treatments.join('\n') : `  ${t('diagnosis.noTreatmentRecorded')}`;

    const prevention = enrichment.prevention?.length
      ? enrichment.prevention.map((s: string) => `  - ${s}`).join('\n')
      : `  ${t('diagnosis.noPreventionRecorded')}`;

    return [
      `\u{1F33F} *${t('diagnosis.shareTitle')}*`,
      '',
      `\u{1F50D} *${t('diagnosis.sharePest')}:* ${pestName}`,
      `\u{1F4CA} *${t('diagnosis.shareConfidence')}:* ${conf}%`,
      `\u{26A0}\u{FE0F} *${t('diagnosis.shareSeverity')}:* ${severity}`,
      `\u{1F331} *${t('diagnosis.shareCrop')}:* ${crop}`,
      '',
      `\u{1F4CB} *${t('diagnosis.shareSymptoms')}:*`,
      symptoms,
      '',
      `\u{1F48A} *${t('diagnosis.shareTreatment')}:*`,
      treatmentText,
      '',
      `\u{1F6E1}\u{FE0F} *${t('diagnosis.sharePrevention')}:*`,
      prevention,
      '',
      `_${t('diagnosis.shareFooter')}_`,
    ].join('\n');
  }, [result, enrichment, confidence, isHealthy, t]);

  const handleWhatsAppShare = useCallback(async () => {
    const text = buildShareText();
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp', t('diagnosis.whatsAppNotInstalled'));
    }
  }, [buildShareText]);

  const buildPdfHtml = useCallback(() => {
    const pestName = isHealthy
      ? t('diagnosis.healthy')
      : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected');
    const conf = Math.round(confidence * 100);
    const crop = result.crop || t('diagnosis.notInformed');
    const severity = severityLabel();
    const date = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const buildList = (items: string[] | undefined) => {
      if (!items?.length) return `<p style="color:#8E8E93;">${t('diagnosis.noInfoAvailable')}</p>`;
      return '<ul>' + items.map((s: string) => `<li>${s}</li>`).join('') + '</ul>';
    };

    const sections: string[] = [];
    if (enrichment.description) {
      sections.push(`<h2>${t('diagnosis.description')}</h2><p>${enrichment.description}</p>`);
    }
    if (enrichment.symptoms?.length) {
      sections.push(`<h2>${t('diagnosis.symptoms')}</h2>${buildList(enrichment.symptoms)}`);
    }
    if (enrichment.causes?.length) {
      sections.push(`<h2>${t('diagnosis.causes')}</h2>${buildList(enrichment.causes)}`);
    }
    if (enrichment.cultural_treatment?.length) {
      sections.push(
        `<h2>${t('diagnosis.culturalControl')}</h2>${buildList(enrichment.cultural_treatment)}`,
      );
    }
    if (enrichment.chemical_treatment?.length) {
      sections.push(
        `<h2>${t('diagnosis.chemicalControl')}</h2><p style="color:#EBB026;font-size:12px;">${t('diagnosis.pdfChemicalWarning')}</p>${buildList(enrichment.chemical_treatment)}`,
      );
    }
    if (enrichment.biological_treatment?.length) {
      sections.push(
        `<h2>${t('diagnosis.biologicalControl')}</h2>${buildList(enrichment.biological_treatment)}`,
      );
    }
    if (enrichment.prevention?.length) {
      sections.push(`<h2>${t('diagnosis.prevention')}</h2>${buildList(enrichment.prevention)}`);
    }
    if (enrichment.monitoring?.length) {
      sections.push(`<h2>${t('diagnosis.monitoring')}</h2>${buildList(enrichment.monitoring)}`);
    }
    if (enrichment.favorable_conditions?.length) {
      sections.push(
        `<h2>${t('diagnosis.favorableConditions')}</h2>${buildList(enrichment.favorable_conditions)}`,
      );
    }
    if (enrichment.economic_impact) {
      sections.push(
        `<h2>${t('diagnosis.economicImpact')}</h2><p>${enrichment.economic_impact}</p>`,
      );
    }
    if (enrichment.mip_strategy) {
      sections.push(`<h2>${t('diagnosis.mipStrategy')}</h2><p>${enrichment.mip_strategy}</p>`);
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; color: #1a1a1a; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #0F6B4D, #1A966B); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px 0; font-size: 22px; }
  .header .date { font-size: 13px; opacity: 0.85; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
  .summary-item { flex: 1; min-width: 140px; background: #f5f5f5; border-radius: 10px; padding: 14px; }
  .summary-item .label { font-size: 11px; color: #8E8E93; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .summary-item .value { font-size: 16px; font-weight: 700; }
  .confidence-bar { height: 8px; background: #E5E5EA; border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .confidence-fill { height: 100%; background: #1A966B; border-radius: 4px; }
  h2 { color: #1A966B; font-size: 16px; border-bottom: 2px solid #1A966B20; padding-bottom: 6px; margin-top: 28px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E5E5EA; font-size: 11px; color: #8E8E93; text-align: center; }
  .severity-critical { color: #D32F2F; }
  .severity-high { color: #F06652; }
  .severity-medium { color: #EBB026; }
  .severity-low { color: #1A966B; }
</style>
</head>
<body>
  <div class="header">
    <h1>${t('diagnosis.pdfTitle')}</h1>
    <div class="date">${date}</div>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfPestIdentified')}</div>
      <div class="value">${pestName}</div>
      ${enrichment.scientific_name ? `<div style="font-size:12px;color:#8E8E93;font-style:italic;">${enrichment.scientific_name}</div>` : ''}
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.confidence')}</div>
      <div class="value">${conf}%</div>
      <div class="confidence-bar"><div class="confidence-fill" style="width:${conf}%"></div></div>
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfSeverity')}</div>
      <div class="value severity-${enrichment?.severity || 'low'}">${severity}</div>
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfCrop')}</div>
      <div class="value">${crop}</div>
    </div>
  </div>

  ${sections.join('\n')}

  <div class="footer">
    ${t('diagnosis.pdfFooter')}
  </div>
</body>
</html>`;
  }, [result, enrichment, confidence, isHealthy, t]);

  const handlePdfExport = useCallback(async () => {
    try {
      const html = buildPdfHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('diagnosis.exportPdfDialogTitle'),
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert(t('common.error'), t('diagnosis.exportPdfError'));
    }
  }, [buildPdfHtml]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <LinearGradient
          colors={
            isHealthy ? (Gradients.hero as any) : [severityColor + '25', severityColor + '08']
          }
          style={styles.header}
        >
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              onPress={() => router.dismissAll()}
              style={styles.backBtn}
              accessibilityLabel={t('diagnosis.closeResult')}
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={isHealthy ? '#FFF' : Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleWhatsAppShare}
              style={styles.backBtn}
              accessibilityLabel={t('diagnosis.shareDiagnosis')}
              accessibilityRole="button"
              accessibilityHint={t('diagnosis.shareHint')}
            >
              <Ionicons name="share-outline" size={22} color={isHealthy ? '#FFF' : Colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerContent}>
            <View
              style={[
                styles.headerIcon,
                { backgroundColor: isHealthy ? 'rgba(255,255,255,0.2)' : severityColor + '25' },
              ]}
            >
              <Ionicons
                name={isHealthy ? 'checkmark-circle' : 'warning'}
                size={32}
                color={isHealthy ? '#FFF' : severityColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pestName, isHealthy && { color: '#FFF' }]}>
                {isHealthy
                  ? t('diagnosis.healthy')
                  : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected')}
              </Text>
              {!isHealthy && (
                <Text style={styles.scientific}>{enrichment.scientific_name || ''}</Text>
              )}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: severityColor + '1F' }]}>
            <Ionicons name="speedometer" size={10} color={severityColor} />
            <Text style={[styles.badgeText, { color: severityColor }]}>
              {confidence > 0.7
                ? t('diagnosis.confidenceHigh')
                : confidence > 0.4
                  ? t('diagnosis.confidenceMedium')
                  : t('diagnosis.confidenceLow')}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: Colors.techBlue + '1F' }]}>
            <Ionicons name="analytics" size={10} color={Colors.techBlue} />
            <Text style={[styles.badgeText, { color: Colors.techBlue }]}>
              {t('diagnosis.confidence')}: {Math.round(confidence * 100)}%
            </Text>
          </View>
          {result.crop && (
            <View style={[styles.badge, { backgroundColor: Colors.accent + '1F' }]}>
              <Ionicons name="leaf" size={10} color={Colors.accent} />
              <Text style={[styles.badgeText, { color: Colors.accent }]}>{result.crop}</Text>
            </View>
          )}
        </View>

        <View style={styles.sections}>
          {enrichment.description && (
            <CollapsibleSection
              title={t('diagnosis.description')}
              icon="document-text"
              iconColor={Colors.accent}
              defaultExpanded
            >
              <Text style={styles.sectionText}>{enrichment.description}</Text>
            </CollapsibleSection>
          )}
          {enrichment.symptoms?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.symptoms')}
              icon="eye"
              iconColor={Colors.coral}
              defaultExpanded
            >
              {enrichment.symptoms.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.causes?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.causes')}
              icon="alert-circle"
              iconColor={Colors.warmAmber}
            >
              {enrichment.causes.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.cultural_treatment?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.culturalControl')}
              icon="hand-left"
              iconColor={Colors.accent}
            >
              {enrichment.cultural_treatment.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.chemical_treatment?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.chemicalControl')}
              icon="flask"
              iconColor={Colors.techBlue}
            >
              <View style={styles.warning}>
                <Ionicons name="warning" size={14} color={Colors.warmAmber} />
                <Text style={styles.warningText}>{t('diagnosis.chemicalWarning')}</Text>
              </View>
              {enrichment.chemical_treatment.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.biological_treatment?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.biologicalControl')}
              icon="bug"
              iconColor="#4CAF50"
            >
              {enrichment.biological_treatment.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: '#4CAF50' }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.prevention?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.prevention')}
              icon="shield-checkmark"
              iconColor="#00BCD4"
            >
              {enrichment.prevention.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: '#00BCD4' }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.monitoring?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.monitoring')}
              icon="eye"
              iconColor={Colors.techBlue}
            >
              {enrichment.monitoring.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.favorable_conditions?.length > 0 && (
            <CollapsibleSection
              title={t('diagnosis.favorableConditions')}
              icon="thermometer"
              iconColor={Colors.warmAmber}
            >
              {enrichment.favorable_conditions.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={styles.sectionText}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {enrichment.economic_impact && (
            <CollapsibleSection
              title={t('diagnosis.economicImpact')}
              icon="trending-down"
              iconColor={Colors.coral}
            >
              <Text style={styles.sectionText}>{enrichment.economic_impact}</Text>
            </CollapsibleSection>
          )}
          {enrichment.mip_strategy && (
            <CollapsibleSection
              title={t('diagnosis.mipStrategy')}
              icon="leaf"
              iconColor={Colors.accent}
            >
              <Text style={styles.sectionText}>{enrichment.mip_strategy}</Text>
            </CollapsibleSection>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={handleWhatsAppShare}
            activeOpacity={0.75}
            accessibilityLabel={t('diagnosis.shareWhatsApp')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.shareHint')}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFF" accessibilityElementsHidden />
            <Text style={styles.actionBtnText}>{t('diagnosis.shareWhatsApp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pdfBtn}
            onPress={handlePdfExport}
            activeOpacity={0.75}
            accessibilityLabel={t('diagnosis.exportPdfA11y')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.exportPdfHint')}
          >
            <Ionicons
              name="document-text"
              size={20}
              color={Colors.accent}
              accessibilityElementsHidden
            />
            <Text style={[styles.actionBtnText, { color: Colors.accent }]}>
              {t('diagnosis.exportPdf')}
            </Text>
          </TouchableOpacity>
        </View>

        <PremiumCard style={{ marginHorizontal: Spacing.lg, marginBottom: 32 }}>
          <Text style={styles.detailTitle}>{t('diagnosis.analysisDetails')}</Text>
          {[
            [t('diagnosis.selectedCrop'), result.crop],
            [t('diagnosis.confidence'), `${Math.round(confidence * 100)}%`],
            ['ID', result.pest_id],
            [t('diagnosis.location'), result.location_name],
          ]
            .filter(([, v]) => v)
            .map(([label, value], i) => (
              <View key={i} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
        </PremiumCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pestName: { fontSize: FontSize.title2, fontWeight: '700' },
  scientific: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: Spacing.lg },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontSize: FontSize.caption, fontWeight: '600' },
  sections: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  sectionText: { fontSize: FontSize.subheadline, lineHeight: 22, flex: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: Colors.warmAmber + '14',
    borderRadius: 8,
    marginBottom: 10,
  },
  warningText: { fontSize: FontSize.caption, color: Colors.warmAmber, flex: 1 },
  detailTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: Colors.accent,
    marginBottom: 10,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  detailValue: { fontSize: FontSize.subheadline, fontWeight: '600' },
  errorCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: { fontSize: FontSize.title2, fontWeight: '700', marginBottom: 8 },
  errorMsg: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  closeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
  },
  closeBtnText: { fontSize: FontSize.headline, fontWeight: '700', color: '#FFF' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent + '14',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.accent + '40',
  },
  actionBtnText: { fontSize: FontSize.caption, fontWeight: '700', color: '#FFF' },
});
