import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  Gradients,
} from '../../constants/theme';
import {
  AppBar,
  IconButton,
  Button,
  Card,
  SectionHeader,
  SeverityBadge,
  type SeverityLevel,
} from '../../components/ui';
import { ConfidenceBar } from '../../components/ConfidenceBar';
import { trackSuccessfulDiagnosis } from '../../services/storeReview';
import { useDiagnosis } from '../../contexts/DiagnosisContext';
import type { AgrioEnrichment } from '../../types/diagnosis';

export default function ResultScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { imageUri } = useDiagnosis();
  const { data, error, queued } = useLocalSearchParams<{
    data?: string;
    error?: string;
    queued?: string;
  }>();

  // Parse result data upfront (before any hooks) to avoid conditional hook calls
  const result = useMemo(() => {
    try {
      return JSON.parse(data || '{}');
    } catch {
      // Invalid JSON data — use empty result, handled by empty state below
      return {};
    }
  }, [data]);

  const isHealthy =
    !result.pest_name ||
    result.pest_name?.toLowerCase().includes('healthy') ||
    result.pest_id === 'Healthy';
  const confidence = result.confidence ?? 0;

  // P0-1: invalid_image — edge function returned when confidence < 0.5 or not a plant
  const isInvalidImage = result.pest_id === 'invalid_image';
  // P0-1: Low-confidence warning — even when image is valid, alert user if < 0.7
  const isLowConfidence = !isInvalidImage && !isHealthy && confidence > 0 && confidence < 0.7;

  const enrichment = useMemo((): AgrioEnrichment => {
    try {
      let notes: Record<string, unknown> = {} as Record<string, unknown>;
      if (result.parsedNotes) notes = result.parsedNotes;
      else if (typeof result.notes === 'string') notes = JSON.parse(result.notes);
      else notes = result.notes || {};
      return (notes.enrichment || {}) as AgrioEnrichment;
    } catch {
      return {} as AgrioEnrichment;
    }
  }, [result]);

  // Map enrichment severity → SeverityBadge level (typed). Fallback by confidence.
  const severityForBadge: SeverityLevel = useMemo(() => {
    const s = enrichment?.severity;
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'medium') return 'medium';
    if (s === 'low' || s === 'none' || isHealthy) return 'low';
    if (confidence > 0.7) return 'high';
    if (confidence > 0.4) return 'medium';
    return 'low';
  }, [enrichment, isHealthy, confidence]);

  const severityLabel = useCallback(() => {
    const s = enrichment?.severity;
    if (s === 'critical') return t('severity.critical');
    if (s === 'high') return t('severity.high');
    if (s === 'medium') return t('severity.medium');
    if (s === 'low') return t('severity.low');
    if (s === 'none' || isHealthy) return t('severity.none');
    return t('severity.undefined');
  }, [enrichment, isHealthy, t]);

  // Track successful diagnosis for store review prompt
  // Hook is called unconditionally (React rules of hooks) but logic is guarded
  useEffect(() => {
    if (!error && !queued && result.pest_name) {
      trackSuccessfulDiagnosis();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // All useCallback hooks must be declared before any early returns (Rules of Hooks)
  const buildShareText = useCallback(() => {
    const pestName = isHealthy
      ? t('diagnosis.healthy')
      : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected');
    const conf = Math.round(confidence * 100);
    const crop = result.crop || t('diagnosis.notInformed');
    const sev = severityLabel();

    const symptoms = enrichment.symptoms?.length
      ? enrichment.symptoms!.map((s: string) => `  - ${s}`).join('\n')
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
      ? enrichment.prevention!.map((s: string) => `  - ${s}`).join('\n')
      : `  ${t('diagnosis.noPreventionRecorded')}`;

    return [
      `\u{1F33F} *${t('diagnosis.shareTitle')}*`,
      '',
      `\u{1F50D} *${t('diagnosis.sharePest')}:* ${pestName}`,
      `\u{1F4CA} *${t('diagnosis.shareConfidence')}:* ${conf}%`,
      `\u{26A0}\u{FE0F} *${t('diagnosis.shareSeverity')}:* ${sev}`,
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
  }, [result, enrichment, confidence, isHealthy, t, severityLabel]);

  const handleWhatsAppShare = useCallback(async () => {
    const text = buildShareText();
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp', t('diagnosis.whatsAppNotInstalled'));
    }
  }, [buildShareText, t]);

  const buildPdfHtml = useCallback(() => {
    const pestName = isHealthy
      ? t('diagnosis.healthy')
      : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected');
    const conf = Math.round(confidence * 100);
    const crop = result.crop || t('diagnosis.notInformed');
    const sev = severityLabel();
    const date = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const escapeHtml = (str: string): string =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Sanitize all user-controlled values before HTML interpolation
    const safePestName = escapeHtml(pestName);
    const safeCrop = escapeHtml(crop);
    const safeSev = escapeHtml(sev);
    const safeDate = escapeHtml(date);
    const safeScientificName = enrichment.scientific_name
      ? escapeHtml(enrichment.scientific_name)
      : '';

    const buildList = (items: string[] | undefined) => {
      if (!items?.length) return `<p style="color:#8E8E93;">${t('diagnosis.noInfoAvailable')}</p>`;
      return '<ul>' + items.map((s: string) => `<li>${escapeHtml(s)}</li>`).join('') + '</ul>';
    };

    const sections: string[] = [];
    if (enrichment.description) {
      sections.push(
        `<h2>${t('diagnosis.description')}</h2><p>${escapeHtml(enrichment.description)}</p>`,
      );
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
        `<h2>${t('diagnosis.economicImpact')}</h2><p>${escapeHtml(enrichment.economic_impact)}</p>`,
      );
    }
    if (enrichment.mip_strategy) {
      sections.push(
        `<h2>${t('diagnosis.mipStrategy')}</h2><p>${escapeHtml(enrichment.mip_strategy)}</p>`,
      );
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 32px; color: #1a1a1a; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #06281D, #0B3D2E); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px 0; font-size: 22px; }
  .header .date { font-size: 13px; opacity: 0.85; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
  .summary-item { flex: 1; min-width: 140px; background: #F7F3EC; border-radius: 10px; padding: 14px; }
  .summary-item .label { font-size: 11px; color: #8A8373; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .summary-item .value { font-size: 16px; font-weight: 700; }
  .confidence-bar { height: 8px; background: #E5DECD; border-radius: 4px; margin-top: 8px; overflow: hidden; }
  .confidence-fill { height: 100%; background: #0B3D2E; border-radius: 4px; }
  h2 { color: #0B3D2E; font-size: 16px; border-bottom: 2px solid #0B3D2E20; padding-bottom: 6px; margin-top: 28px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E5DECD; font-size: 11px; color: #8A8373; text-align: center; }
  .severity-critical { color: #D32F2F; }
  .severity-high { color: #B3462E; }
  .severity-medium { color: #C89B3C; }
  .severity-low { color: #0B3D2E; }
</style>
</head>
<body>
  <div class="header">
    <h1>${t('diagnosis.pdfTitle')}</h1>
    <div class="date">${safeDate}</div>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfPestIdentified')}</div>
      <div class="value">${safePestName}</div>
      ${safeScientificName ? `<div style="font-size:12px;color:#8A8373;font-style:italic;">${safeScientificName}</div>` : ''}
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.confidence')}</div>
      <div class="value">${conf}%</div>
      <div class="confidence-bar"><div class="confidence-fill" style="width:${conf}%"></div></div>
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfSeverity')}</div>
      <div class="value severity-${enrichment?.severity || 'low'}">${safeSev}</div>
    </div>
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfCrop')}</div>
      <div class="value">${safeCrop}</div>
    </div>
  </div>

  ${sections.join('\n')}

  <div class="footer">
    ${t('diagnosis.pdfFooter')}
  </div>
</body>
</html>`;
  }, [result, enrichment, confidence, isHealthy, t, severityLabel]);

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
    } catch {
      Alert.alert(t('common.error'), t('diagnosis.exportPdfError'));
    }
  }, [buildPdfHtml, t]);

  // Early returns AFTER all hooks have been called
  if (queued === 'true') {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('diagnosis.queued')}
          leading={
            <IconButton
              iconName="arrow-back"
              accessibilityLabel={t('diagnosis.backToHomeA11y')}
              onPress={() => router.dismissAll()}
            />
          }
        />
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.warmAmber + '1F' }]}>
            <Ionicons name="cloud-upload-outline" size={44} color={Colors.warmAmber} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.queued')}
          </Text>
          <Text style={styles.errorMsg}>{t('diagnosis.queuedMessage')}</Text>
          <Button
            variant="primary"
            size="lg"
            block
            onPress={() => router.dismissAll()}
            accessibilityLabel={t('diagnosis.backToHomeA11y')}
          >
            {t('diagnosis.backToHome')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('diagnosis.error')}
          leading={
            <IconButton
              iconName="arrow-back"
              accessibilityLabel={t('diagnosis.closeDiagnosisA11y')}
              onPress={() => router.dismissAll()}
            />
          }
        />
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.coral + '1F' }]}>
            <Ionicons
              name="warning"
              size={44}
              color={Colors.coral}
              accessibilityLabel={t('diagnosis.errorIconA11y')}
              accessibilityRole="image"
            />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>{t('diagnosis.error')}</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <Button
            variant="primary"
            size="lg"
            block
            onPress={() => router.dismissAll()}
            accessibilityLabel={t('diagnosis.closeDiagnosisA11y')}
          >
            {t('diagnosis.close')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // P0-1: Invalid image state — edge function rejected for low confidence (<0.5) or non-plant
  if (isInvalidImage) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('diagnosis.invalidImageTitle')}
          leading={
            <IconButton
              iconName="arrow-back"
              accessibilityLabel={t('diagnosis.tryAgainA11y')}
              onPress={() => router.replace('/diagnosis/camera')}
            />
          }
        />
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.warmAmber + '1F' }]}>
            <Ionicons name="image-outline" size={44} color={Colors.warmAmber} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.invalidImageTitle')}
          </Text>
          <Text style={styles.errorMsg}>
            {result.parsedNotes?.message ||
              (typeof result.notes === 'string'
                ? (() => {
                    try {
                      return JSON.parse(result.notes).message;
                    } catch {
                      return t('diagnosis.invalidImageMsg');
                    }
                  })()
                : t('diagnosis.invalidImageMsg'))}
          </Text>
          <Button
            variant="primary"
            size="lg"
            block
            onPress={() => router.replace('/diagnosis/camera')}
            accessibilityLabel={t('diagnosis.tryAgainA11y')}
          >
            {t('diagnosis.tryAgain')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state: no valid diagnosis data received
  if (!data || (!result.pest_name && !result.pest_id)) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('diagnosis.noData')}
          leading={
            <IconButton
              iconName="arrow-back"
              accessibilityLabel={t('diagnosis.newDiagnosis')}
              onPress={() => router.replace('/diagnosis/camera')}
            />
          }
        />
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.systemGray5 }]}>
            <Ionicons name="document-text-outline" size={44} color={Colors.systemGray} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.noData')}
          </Text>
          <Text style={styles.errorMsg}>{t('diagnosis.noDataMsg')}</Text>
          <Button
            variant="primary"
            size="lg"
            block
            onPress={() => router.replace('/diagnosis/camera')}
            accessibilityLabel={t('diagnosis.newDiagnosis')}
          >
            {t('diagnosis.newDiagnosis')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const pestDisplayName = isHealthy
    ? t('diagnosis.healthy')
    : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected');

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      {/* AppBar with share-outline trailing icon (per spec) */}
      <AppBar
        title={t('diagnosis.diagnosisTitle', { defaultValue: 'Diagnóstico' })}
        leading={
          <IconButton
            iconName="arrow-back"
            accessibilityLabel={t('diagnosis.closeResult')}
            onPress={() => router.dismissAll()}
          />
        }
        trailing={
          <IconButton
            iconName="share-outline"
            accessibilityLabel={t('diagnosis.shareDiagnosis')}
            accessibilityHint={t('diagnosis.shareHint')}
            onPress={handleWhatsAppShare}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero photo of leaf — 200h, image taken by user */}
        <View style={styles.heroPhotoWrap}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroPhoto}
              contentFit="cover"
              transition={200}
              accessibilityLabel={t('cropSelect.photoA11y')}
            />
          ) : (
            <LinearGradient colors={Gradients.hero} style={styles.heroPhoto}>
              <Ionicons
                name={isHealthy ? 'checkmark-circle' : 'leaf'}
                size={56}
                color="rgba(255,255,255,0.85)"
                accessibilityElementsHidden
              />
            </LinearGradient>
          )}
        </View>

        {/* Pest header: name + scientific + severity */}
        <View style={styles.headerBlock}>
          <Text
            style={[styles.pestName, isDark && styles.textDark]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
          >
            {pestDisplayName}
          </Text>
          {!isHealthy && enrichment.scientific_name ? (
            <Text style={styles.scientific} maxFontSizeMultiplier={1.4}>
              {enrichment.scientific_name}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <SeverityBadge level={severityForBadge}>{severityLabel()}</SeverityBadge>
            {result.crop ? (
              <View style={styles.cropPill}>
                <Ionicons name="leaf" size={12} color={Colors.accent} />
                <Text style={styles.cropPillText}>{result.crop}</Text>
              </View>
            ) : null}
          </View>

          {/* Confidence bar — uses existing primitive */}
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>{t('diagnosis.confidence')}</Text>
            <ConfidenceBar value={confidence} />
          </View>
        </View>

        {/* P0-1: Low confidence warning banner — confidence < 70% */}
        {isLowConfidence && (
          <View
            style={styles.lowConfidenceBanner}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={t('diagnosis.lowConfidenceBanner')}
          >
            <Ionicons name="warning" size={18} color={Colors.warmAmber} />
            <Text style={styles.lowConfidenceText}>{t('diagnosis.lowConfidenceBanner')}</Text>
          </View>
        )}

        {/* Sections: Sintomas, Tratamento (MIP), Boas Práticas — each via SectionHeader + Card */}
        {enrichment.description ? (
          <>
            <SectionHeader title={t('diagnosis.description')} />
            <Card style={styles.sectionCard}>
              <Text style={[styles.bodyText, isDark && styles.textDark]}>
                {enrichment.description}
              </Text>
            </Card>
          </>
        ) : null}

        {(enrichment.symptoms?.length ?? 0) > 0 && (
          <>
            <SectionHeader title={t('diagnosis.symptoms')} />
            <Card style={styles.sectionCard}>
              {enrichment.symptoms!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {(enrichment.causes?.length ?? 0) > 0 && (
          <>
            <SectionHeader title={t('diagnosis.causes')} />
            <Card style={styles.sectionCard}>
              {enrichment.causes!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* Tratamento (MIP) — combines cultural / chemical / biological under one umbrella */}
        {((enrichment.cultural_treatment?.length ?? 0) > 0 ||
          (enrichment.chemical_treatment?.length ?? 0) > 0 ||
          (enrichment.biological_treatment?.length ?? 0) > 0 ||
          enrichment.mip_strategy) && (
          <>
            <SectionHeader title={t('diagnosis.mipTitle', { defaultValue: 'Tratamento (MIP)' })} />
            <Card style={styles.sectionCard}>
              {enrichment.mip_strategy ? (
                <Text style={[styles.bodyText, isDark && styles.textDark, { marginBottom: 10 }]}>
                  {enrichment.mip_strategy}
                </Text>
              ) : null}

              {(enrichment.cultural_treatment?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.culturalControl')}</Text>
                  {enrichment.cultural_treatment!.map((s: string, i: number) => (
                    <View key={`cul-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(enrichment.chemical_treatment?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.chemicalControl')}</Text>
                  <View style={styles.warning}>
                    <Ionicons name="warning" size={14} color={Colors.warmAmber} />
                    <Text style={styles.warningText}>{t('diagnosis.chemicalWarning')}</Text>
                  </View>
                  {enrichment.chemical_treatment!.map((s: string, i: number) => (
                    <View key={`chm-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(enrichment.biological_treatment?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.biologicalControl')}</Text>
                  {enrichment.biological_treatment!.map((s: string, i: number) => (
                    <View key={`bio-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}

        {/* Boas Práticas — prevention + monitoring + favorable conditions */}
        {((enrichment.prevention?.length ?? 0) > 0 ||
          (enrichment.monitoring?.length ?? 0) > 0 ||
          (enrichment.favorable_conditions?.length ?? 0) > 0) && (
          <>
            <SectionHeader
              title={t('diagnosis.bestPractices', { defaultValue: 'Boas Práticas' })}
            />
            <Card style={styles.sectionCard}>
              {(enrichment.prevention?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.prevention')}</Text>
                  {enrichment.prevention!.map((s: string, i: number) => (
                    <View key={`prv-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(enrichment.monitoring?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.monitoring')}</Text>
                  {enrichment.monitoring!.map((s: string, i: number) => (
                    <View key={`mon-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(enrichment.favorable_conditions?.length ?? 0) > 0 && (
                <View style={styles.subSection}>
                  <Text style={styles.subSectionTitle}>{t('diagnosis.favorableConditions')}</Text>
                  {enrichment.favorable_conditions!.map((s: string, i: number) => (
                    <View key={`fav-${i}`} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                      <Text style={[styles.bodyText, isDark && styles.textDark]}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}

        {enrichment.economic_impact ? (
          <>
            <SectionHeader title={t('diagnosis.economicImpact')} />
            <Card style={styles.sectionCard}>
              <Text style={[styles.bodyText, isDark && styles.textDark]}>
                {enrichment.economic_impact}
              </Text>
            </Card>
          </>
        ) : null}

        {/* Analysis details — kept as a small info card (preserves the existing data row) */}
        <SectionHeader title={t('diagnosis.analysisDetails')} />
        <Card style={styles.sectionCard}>
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
                <Text style={[styles.detailValue, isDark && styles.textDark]}>{value}</Text>
              </View>
            ))}
        </Card>

        {/* Tertiary inline link — preserves PDF export API call */}
        <TouchableOpacity
          onPress={handlePdfExport}
          accessibilityRole="button"
          accessibilityLabel={t('diagnosis.exportPdfA11y')}
          accessibilityHint={t('diagnosis.exportPdfHint')}
          style={styles.pdfLink}
          activeOpacity={0.6}
        >
          <Ionicons name="document-text-outline" size={16} color={Colors.accent} />
          <Text style={styles.pdfLinkText}>{t('diagnosis.exportPdf')}</Text>
        </TouchableOpacity>

        {/* CTAs at bottom — primary "Salvar no Histórico" + secondary "Compartilhar" */}
        <View style={styles.ctaRow}>
          <Button
            variant="primary"
            size="lg"
            block
            iconName="bookmark"
            onPress={() => router.dismissAll()}
            accessibilityLabel={t('diagnosis.saveToHistory', {
              defaultValue: 'Salvar no Histórico',
            })}
          >
            {t('diagnosis.saveToHistory', { defaultValue: 'Salvar no Histórico' })}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            block
            iconName="share-outline"
            onPress={handleWhatsAppShare}
            accessibilityLabel={t('diagnosis.shareDiagnosis')}
            accessibilityHint={t('diagnosis.shareHint')}
            style={{ marginTop: Spacing.sm }}
          >
            {t('diagnosis.shareLabel', { defaultValue: 'Compartilhar' })}
          </Button>
        </View>

        {/* P0-1: Mandatory CREA legal disclaimer (Lei 7.802/89) — verbatim, italic, 12pt */}
        <Text
          style={styles.legalDisclaimer}
          accessibilityRole="text"
          accessibilityLabel={t('diagnosis.legalDisclaimer')}
        >
          {t('diagnosis.legalDisclaimer')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  textDark: { color: Colors.textDark },
  scrollContent: { paddingBottom: Spacing.xxxl },

  heroPhotoWrap: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.systemGray5,
  },
  heroPhoto: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerBlock: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  // 22/700 per spec
  pestName: {
    fontSize: FontSize.title2, // 22
    fontWeight: FontWeight.bold,
    color: Colors.text,
    letterSpacing: -0.4,
  },
  // 14 italic textSecondary per spec
  scientific: {
    fontSize: 14,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
    flexWrap: 'wrap',
  },
  cropPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent + '14',
    borderWidth: 1,
    borderColor: Colors.accent + '4D',
  },
  cropPillText: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.md,
  },
  confidenceLabel: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  sectionCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  bodyText: {
    fontSize: FontSize.subheadline,
    lineHeight: 22,
    color: Colors.text,
    flex: 1,
  },

  subSection: {
    marginBottom: Spacing.md,
  },
  subSectionTitle: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
  },

  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: Colors.warmAmber + '14',
    borderRadius: 8,
    marginBottom: 10,
  },
  warningText: {
    fontSize: FontSize.caption,
    color: Colors.warmAmber,
    flex: 1,
    fontWeight: FontWeight.semibold,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  detailValue: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },

  pdfLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    marginHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  pdfLinkText: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
  },

  ctaRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  // Legal disclaimer: 12 textTertiary italic per spec — verbatim from i18n
  legalDisclaimer: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    lineHeight: 17,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    textAlign: 'center',
  },

  // P0-1: Low confidence warning banner (confidence < 70%) — kept inline above sections
  lowConfidenceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: 14,
    backgroundColor: Colors.warmAmber + '1F',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warmAmber,
    borderRadius: BorderRadius.md,
  },
  lowConfidenceText: {
    flex: 1,
    fontSize: FontSize.caption,
    color: Colors.text,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
  },

  // Error / queued / invalid / empty states
  errorCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingBottom: Spacing.xxxl,
  },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  errorTitle: {
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    marginBottom: 8,
    color: Colors.text,
  },
  errorMsg: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xxxl,
  },
});
