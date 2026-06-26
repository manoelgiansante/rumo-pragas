import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  Image,
  Share,
  useColorScheme,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { CollapsibleSection } from '../../components/CollapsibleSection';
import { MipCard } from '../../components/MipCard';
import { TopAlternatives } from '../../components/TopAlternatives';
import { trackSuccessfulDiagnosis } from '../../services/storeReview';
import {
  trackShareDiagnosis,
  trackPestDetailViewed,
  trackProGateShown,
  trackProGateTapped,
  trackEvent,
} from '../../services/analytics';
import { useSubscription } from '../../hooks/useSubscription';
import { useDiagnosis } from '../../contexts/DiagnosisContext';
import { savePestToCache } from '../../services/pestRegistry';
import { checkSubscriptionStatus, isRevenueCatConfigured } from '../../services/purchases';
import { useMipKnowledge, type SubscriptionTier } from '../../hooks/useMipKnowledge';
import { addBreadcrumb } from '../../services/sentry-shim';
import type { AgrioEnrichment, AgrioPrediction } from '../../types/diagnosis';

// --- Free vs Pro gate ------------------------------------------------------
// Free users see the hero, treatment summary (cultural level only), and may
// share via WhatsApp. Pro features: PDF export, alternative diagnoses, full
// pest fact sheet, biological + chemical levels, save to history.
const FREE_ALTERNATIVES_VISIBLE = 0;
const PRO_ALTERNATIVES_VISIBLE = 3;

export default function ResultScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPro } = useSubscription();
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

  // Alternative predictions surfaced by the AI (top 3 candidates besides the winner).
  // Used by both the legacy alternative-diagnoses panel and the new TopAlternatives card.
  const alternatives = useMemo((): AgrioPrediction[] => {
    try {
      const notes =
        result.parsedNotes ||
        (typeof result.notes === 'string' ? JSON.parse(result.notes) : result.notes || {});
      const list: AgrioPrediction[] = notes?.predictions ?? notes?.id_array ?? [];
      // Drop the winning pest from alternatives to avoid duplicate UI rows.
      return list.filter((p) => p.id !== result.pest_id).slice(0, PRO_ALTERNATIVES_VISIBLE);
    } catch {
      return [];
    }
  }, [result]);

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

  const severityLabel = useCallback(() => {
    const s = enrichment?.severity;
    if (s === 'critical') return t('severity.critical');
    if (s === 'high') return t('severity.high');
    if (s === 'medium') return t('severity.medium');
    if (s === 'low') return t('severity.low');
    if (s === 'none' || isHealthy) return t('severity.none');
    return t('severity.undefined');
  }, [enrichment, isHealthy, t]);

  // Animated confidence bar: count up from 0% → confidence% in ~1s on mount.
  // Uses Reanimated worklet so the animation runs entirely on the UI thread.
  const confidenceProgress = useSharedValue(0);
  const [displayConfidence, setDisplayConfidence] = useState(0);
  const [showAlternatives, setShowAlternatives] = useState(false);

  useEffect(() => {
    if (!error && !queued && result.pest_id) {
      confidenceProgress.value = 0;
      confidenceProgress.value = withTiming(confidence, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence, error, queued, result.pest_id]);

  // Mirror shared value → React state so the numeric % ticks up in sync
  useAnimatedReaction(
    () => confidenceProgress.value,
    (value) => {
      runOnJS(setDisplayConfidence)(Math.round(value * 100));
    },
  );

  const confidenceBarStyle = useAnimatedStyle(() => ({
    width: `${confidenceProgress.value * 100}%`,
  }));

  // Track successful diagnosis for store review prompt + persist to local cache
  // so the pest detail page can render fully offline. Hooks are unconditional
  // (React rules of hooks) but logic is guarded.
  useEffect(() => {
    if (!error && !queued && result.pest_name) {
      trackSuccessfulDiagnosis();
      if (result.pest_id && !isHealthy && !isInvalidImage) {
        void savePestToCache({
          id: result.pest_id,
          pest_name: result.pest_name,
          scientific_name: enrichment.scientific_name,
          crop: result.crop,
          image_uri: imageUri ?? undefined,
          confidence,
          enrichment,
          alternatives,
        });
      }
      addBreadcrumb({
        category: 'diagnosis.result',
        message: 'result_rendered',
        level: 'info',
        data: {
          pestId: result.pest_id ?? 'unknown',
          confidence: result.confidence ?? 0,
          severity: enrichment?.severity ?? 'undefined',
          alternativeCount: alternatives.length,
        },
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscription tier — drives MIP premium gating. Default to 'free' until
  // RevenueCat confirms; never block the rest of the screen on this fetch.
  const [tier, setTier] = useState<SubscriptionTier>('free');
  useEffect(() => {
    let cancelled = false;
    if (!isRevenueCatConfigured()) return;
    (async () => {
      try {
        const status = await checkSubscriptionStatus();
        if (!cancelled && status.isActive) setTier(status.plan as SubscriptionTier);
      } catch (e) {
        if (__DEV__) console.warn('[Result] tier check failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve MIP catalog entry from pest/symptoms. Disabled when no useful
  // diagnosis is on screen (healthy plant / no pest_name).
  const mipEnabled = !error && !queued && !isHealthy && !isInvalidImage && !!result.pest_name;
  const mipKnowledge = useMipKnowledge({
    pestName: result.pest_name,
    enrichment,
    crop: result.crop,
    tier,
    enabled: mipEnabled,
  });

  // Fire one analytics event per resolved entry (covers both unlocked and
  // empty states — empty is itself a signal we should grow the catalog).
  useEffect(() => {
    if (!mipEnabled || mipKnowledge.loading) return;
    if (mipKnowledge.entry) {
      trackEvent('mip_card_shown', {
        entry_id: mipKnowledge.entry.id,
        match_score: mipKnowledge.matchScore,
        tier,
        crop: result.crop,
        pest_id: result.pest_id,
      });
    } else {
      trackEvent('mip_card_empty', {
        tier,
        crop: result.crop,
        pest_name: result.pest_name,
        pest_id: result.pest_id,
      });
    }
    // We only want to fire once per resolved entry — keying on entry.id is
    // intentional; the dep on `tier` also re-fires when tier resolves.
  }, [
    mipEnabled,
    mipKnowledge.loading,
    mipKnowledge.entry,
    mipKnowledge.matchScore,
    tier,
    result.crop,
    result.pest_id,
    result.pest_name,
  ]);

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

  // Share the diagnosis. Prefer the WhatsApp deep link when it is actually
  // openable, but NEVER let a missing/unopenable WhatsApp turn into a UX
  // dead-end or an unhandled throw.
  //
  // RUMO-PRAGAS-5 ("Unable to open URL: whatsapp://send?...") root cause:
  //   1. `whatsapp` is not declared in iOS `LSApplicationQueriesSchemes`, so
  //      `Linking.canOpenURL('whatsapp://...')` returns false even when the
  //      app IS installed — and historically `openURL` could throw.
  //   2. The Apple reviewer's device has no WhatsApp at all, so the old code
  //      hit a dead-end Alert ("WhatsApp not installed") with no way to share.
  //
  // Fix: try the WhatsApp deep link inside try/catch; on any failure fall back
  // to the native OS share sheet (`Share.share`), which always works and lets
  // the reviewer (and any non-WhatsApp user) actually share the diagnosis.
  const handleWhatsAppShare = useCallback(async () => {
    void Haptics.selectionAsync().catch(() => {
      /* haptics best-effort */
    });
    const text = buildShareText();

    // 1. Fast path: open WhatsApp directly if it is reachable.
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    try {
      if (await Linking.canOpenURL(url)) {
        trackShareDiagnosis('whatsapp');
        await Linking.openURL(url);
        return;
      }
    } catch (err) {
      // Deep link failed (not installed / scheme not whitelisted) — fall
      // through to the native share sheet. Breadcrumb only, never capture:
      // this is an expected, non-actionable condition.
      addBreadcrumb({
        category: 'share',
        message: 'whatsapp.deeplink.unavailable',
        level: 'info',
        data: { reason: err instanceof Error ? err.message : 'canOpen/open failed' },
      });
    }

    // 2. Graceful fallback: native OS share sheet (works without WhatsApp).
    try {
      trackShareDiagnosis('share_sheet');
      await Share.share({ message: text }, { dialogTitle: t('diagnosis.shareTitle') });
    } catch (err) {
      // The user dismissing the share sheet rejects on some platforms — treat
      // as non-fatal. Only show an alert if sharing is genuinely unavailable.
      addBreadcrumb({
        category: 'share',
        message: 'share.sheet.dismissed_or_failed',
        level: 'info',
        data: { reason: err instanceof Error ? err.message : 'share failed' },
      });
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
    <div class="date">${safeDate}</div>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="label">${t('diagnosis.pdfPestIdentified')}</div>
      <div class="value">${safePestName}</div>
      ${safeScientificName ? `<div style="font-size:12px;color:#8E8E93;font-style:italic;">${safeScientificName}</div>` : ''}
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
    // Premium gate: free users see a paywall CTA instead of PDF generation.
    if (!isPro) {
      trackProGateTapped('pdf');
      router.push('/paywall');
      return;
    }
    void Haptics.selectionAsync().catch(() => {
      /* best-effort */
    });
    try {
      trackShareDiagnosis('pdf');
      const html = buildPdfHtml();
      // Web: printToFileAsync is unsupported and throws. Use the browser print
      // dialog BEFORE attempting the native file write, otherwise the web branch
      // below is unreachable and the export fails silently.
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('diagnosis.exportPdfDialogTitle'),
        UTI: 'com.adobe.pdf',
      });
    } catch {
      showAlert(t('common.error'), t('diagnosis.exportPdfError'));
    }
  }, [buildPdfHtml, t, isPro]);

  const handleViewDetails = useCallback(() => {
    if (!result.pest_id) return;
    if (!isPro) {
      trackProGateTapped('details');
      router.push('/paywall');
      return;
    }
    trackPestDetailViewed(result.pest_id, 'result');
    router.push(`/diagnosis/pest/${encodeURIComponent(result.pest_id)}`);
  }, [result.pest_id, isPro]);

  const handleToggleAlternatives = useCallback(() => {
    if (!isPro && alternatives.length > FREE_ALTERNATIVES_VISIBLE) {
      trackProGateTapped('alternatives');
      router.push('/paywall');
      return;
    }
    setShowAlternatives((v) => !v);
  }, [isPro, alternatives.length]);

  // Track that a pro gate was *shown* (vs tapped) for funnel analysis.
  useEffect(() => {
    if (!isPro && !error && !queued && result.pest_id && !isHealthy && !isInvalidImage) {
      if (alternatives.length > 0) trackProGateShown('alternatives');
      trackProGateShown('pdf');
      trackProGateShown('details');
    }
  }, [isPro, error, queued, result.pest_id, isHealthy, isInvalidImage, alternatives.length]);

  // Early returns AFTER all hooks have been called
  if (queued === 'true') {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.warmAmber + '1F' }]}>
            <Ionicons name="cloud-upload-outline" size={44} color={Colors.warmAmber} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.queued')}
          </Text>
          <Text style={styles.errorMsg}>{t('diagnosis.queuedMessage')}</Text>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: Colors.warmAmber }]}
            onPress={() => router.dismissAll()}
            accessibilityLabel={t('diagnosis.backToHomeA11y')}
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
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
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
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.dismissAll()}
            accessibilityLabel={t('diagnosis.closeDiagnosisA11y')}
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.close')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // P0-1: Invalid image state — edge function rejected for low confidence (<0.5) or non-plant
  if (isInvalidImage) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
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
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: Colors.warmAmber }]}
            onPress={() => router.replace('/diagnosis/camera')}
            accessibilityLabel={t('diagnosis.tryAgainA11y')}
            accessibilityRole="button"
          >
            <Text style={styles.closeBtnText}>{t('diagnosis.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state: no valid diagnosis data received
  if (!data || (!result.pest_name && !result.pest_id)) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.errorCenter}>
          <View style={[styles.errorIcon, { backgroundColor: Colors.systemGray5 }]}>
            <Ionicons name="document-text-outline" size={44} color={Colors.systemGray} />
          </View>
          <Text style={[styles.errorTitle, isDark && styles.textDark]}>
            {t('diagnosis.noData')}
          </Text>
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

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* HERO — captured image overlay + name + animated confidence bar */}
        <View style={styles.heroWrap}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroImage}
              resizeMode="cover"
              accessible
              accessibilityLabel={t('diagnosis.pestDetailHeroAlt')}
              accessibilityRole="image"
            />
          ) : (
            <LinearGradient colors={Gradients.hero} style={styles.heroImage} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(6,40,29,0.55)', 'rgba(6,40,29,0.92)']}
            style={styles.heroGradient}
            pointerEvents="none"
          />
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              onPress={() => router.dismissAll()}
              style={styles.iconBtn}
              accessibilityLabel={t('diagnosis.closeResult')}
              accessibilityRole="button"
              testID="result-close-button"
            >
              <Ionicons name="close" size={22} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleWhatsAppShare}
              style={styles.iconBtn}
              accessibilityLabel={t('diagnosis.shareDiagnosis')}
              accessibilityRole="button"
              accessibilityHint={t('diagnosis.shareHint')}
              testID="result-share-button"
            >
              <Ionicons name="share-outline" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroContent}>
            <View style={styles.heroBadgeRow}>
              {result.crop && (
                <View style={styles.heroBadge}>
                  <Ionicons name="leaf" size={11} color="#FFF" />
                  <Text style={styles.heroBadgeText}>{result.crop}</Text>
                </View>
              )}
              <View style={[styles.heroBadge, { backgroundColor: severityColor + 'CC' }]}>
                <Ionicons name="speedometer" size={11} color="#FFF" />
                <Text style={styles.heroBadgeText}>{severityLabel()}</Text>
              </View>
            </View>
            <Text style={styles.heroPestName} numberOfLines={2} maxFontSizeMultiplier={1.4}>
              {isHealthy
                ? t('diagnosis.healthy')
                : enrichment.name_pt || result.pest_name || t('diagnosis.pestDetected')}
            </Text>
            {!isHealthy && enrichment.scientific_name ? (
              <Text style={styles.heroScientific} numberOfLines={1}>
                {enrichment.scientific_name}
              </Text>
            ) : null}

            {/* Animated confidence bar — UI-thread Reanimated worklet */}
            <View
              style={styles.confidenceWrap}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('diagnosis.confidenceBarA11y', { pct: displayConfidence })}
            >
              <View style={styles.confidenceLabelRow}>
                <Text style={styles.confidenceLabel}>{t('diagnosis.confidence')}</Text>
                <Text style={styles.confidenceValue}>{displayConfidence}%</Text>
              </View>
              <View style={styles.confidenceTrack}>
                <Animated.View style={[styles.confidenceFill, confidenceBarStyle]} />
              </View>
            </View>
          </View>
        </View>

        {/* P0-1: Low confidence warning banner — confidence < 70% */}
        {isLowConfidence && (
          <View
            style={styles.lowConfidenceBanner}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={t('diagnosis.lowConfidenceBanner')}
            testID="result-low-confidence-banner"
          >
            <Ionicons name="warning" size={20} color="#B45309" />
            <Text style={styles.lowConfidenceText}>{t('diagnosis.lowConfidenceBanner')}</Text>
          </View>
        )}

        {/* Top 3 alternative diagnoses — collapsed by default, Pro-gated */}
        {!isHealthy && alternatives.length > 0 && (
          <View style={styles.alternativesWrap}>
            <TouchableOpacity
              style={styles.alternativesHeader}
              onPress={handleToggleAlternatives}
              accessibilityRole="button"
              accessibilityLabel={t('diagnosis.alternativeDiagnoses')}
              accessibilityHint={t('diagnosis.alternativeDiagnosesHint')}
              testID="result-alternatives-toggle"
              activeOpacity={0.7}
            >
              <View style={styles.alternativesHeaderLeft}>
                <Ionicons name="layers" size={18} color={Colors.accent} />
                <Text style={[styles.alternativesTitle, isDark && styles.textDark]}>
                  {t('diagnosis.alternativeDiagnoses')}
                </Text>
                {!isPro && (
                  <View style={styles.proPill}>
                    <Ionicons name="star" size={9} color="#FFF" />
                    <Text style={styles.proPillText}>PRO</Text>
                  </View>
                )}
              </View>
              <Ionicons
                name={showAlternatives && isPro ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
            {showAlternatives && isPro && (
              <View style={styles.alternativesList}>
                {alternatives.map((alt) => (
                  <View
                    key={alt.id}
                    style={styles.alternativeRow}
                    testID={`result-alternative-${alt.id}`}
                  >
                    <View style={styles.alternativeRowMain}>
                      <Text style={[styles.alternativeName, isDark && styles.textDark]}>
                        {alt.common_name || alt.id}
                      </Text>
                      {alt.scientific_name ? (
                        <Text style={styles.alternativeScientific} numberOfLines={1}>
                          {alt.scientific_name}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.alternativeConfidence}>
                      {Math.round((alt.confidence ?? 0) * 100)}%
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Treatment summary card — 3 IPM levels with Pro gate on bio/chem */}
        {!isHealthy && (
          <PremiumCard style={styles.treatmentCard}>
            <View style={styles.treatmentHeader}>
              <Ionicons name="medkit" size={18} color={Colors.accent} />
              <Text style={[styles.treatmentTitle, isDark && styles.textDark]}>
                {t('diagnosis.treatmentSummary')}
              </Text>
            </View>
            <View style={styles.treatmentLevels}>
              <TreatmentLevelRow
                icon="hand-left"
                color={Colors.accent}
                title={t('diagnosis.treatmentLevelCultural')}
                hint={t('diagnosis.treatmentLevelCulturalHint')}
                count={enrichment.cultural_treatment?.length ?? 0}
                isPro={isPro}
                proGated={false}
              />
              <TreatmentLevelRow
                icon="bug"
                color="#4CAF50"
                title={t('diagnosis.treatmentLevelBiological')}
                hint={t('diagnosis.treatmentLevelBiologicalHint')}
                count={enrichment.biological_treatment?.length ?? 0}
                isPro={isPro}
                proGated={!isPro}
              />
              <TreatmentLevelRow
                icon="flask"
                color={Colors.warmAmber}
                title={t('diagnosis.treatmentLevelChemical')}
                hint={t('diagnosis.treatmentLevelChemicalHint')}
                count={enrichment.chemical_treatment?.length ?? 0}
                isPro={isPro}
                proGated={!isPro}
              />
            </View>
            <TouchableOpacity
              style={styles.viewDetailsBtn}
              onPress={handleViewDetails}
              accessibilityRole="button"
              accessibilityLabel={t('diagnosis.viewDetails')}
              accessibilityHint={t('diagnosis.viewDetailsHint')}
              testID="result-view-details-button"
              activeOpacity={0.8}
            >
              <Text style={styles.viewDetailsBtnText}>{t('diagnosis.viewDetails')}</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          </PremiumCard>
        )}

        {/* Full collapsible sections (existing — kept for full content view) */}
        <View style={styles.sections}>
          {/* Top alternatives — second-guess card.
              Rendered ABOVE the description so the user can self-correct fast
              if the hero pick doesn't look like the leaf in front of them. */}
          {!isHealthy && (
            <TopAlternatives predictions={alternatives} primaryId={result.pest_id} max={3} />
          )}

          {enrichment.description && (
            <CollapsibleSection
              title={t('diagnosis.description')}
              icon="document-text"
              iconColor={Colors.accent}
              defaultExpanded
            >
              <Text style={[styles.sectionText, isDark && styles.textDark]}>
                {enrichment.description}
              </Text>
            </CollapsibleSection>
          )}
          {(enrichment.symptoms?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.symptoms')}
              icon="eye"
              iconColor={Colors.coral}
              defaultExpanded
            >
              {enrichment.symptoms!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.causes?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.causes')}
              icon="alert-circle"
              iconColor={Colors.warmAmber}
            >
              {enrichment.causes!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.cultural_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.culturalControl')}
              icon="hand-left"
              iconColor={Colors.accent}
            >
              {enrichment.cultural_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.accent }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {isPro && (enrichment.chemical_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.chemicalControl')}
              icon="flask"
              iconColor={Colors.techBlue}
            >
              <View style={styles.warning}>
                <Ionicons name="warning" size={14} color={Colors.warmAmber} />
                <Text style={styles.warningText}>{t('diagnosis.chemicalWarning')}</Text>
              </View>
              {enrichment.chemical_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {isPro && (enrichment.biological_treatment?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.biologicalControl')}
              icon="bug"
              iconColor="#4CAF50"
            >
              {enrichment.biological_treatment!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: '#4CAF50' }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.prevention?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.prevention')}
              icon="shield-checkmark"
              iconColor="#00BCD4"
            >
              {enrichment.prevention!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: '#00BCD4' }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.monitoring?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.monitoring')}
              icon="eye"
              iconColor={Colors.techBlue}
            >
              {enrichment.monitoring!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.techBlue }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {(enrichment.favorable_conditions?.length ?? 0) > 0 && (
            <CollapsibleSection
              title={t('diagnosis.favorableConditions')}
              icon="thermometer"
              iconColor={Colors.warmAmber}
            >
              {enrichment.favorable_conditions!.map((s: string, i: number) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.warmAmber }]} />
                  <Text style={[styles.sectionText, isDark && styles.textDark]}>{s}</Text>
                </View>
              ))}
            </CollapsibleSection>
          )}
          {isPro && enrichment.economic_impact && (
            <CollapsibleSection
              title={t('diagnosis.economicImpact')}
              icon="trending-down"
              iconColor={Colors.coral}
            >
              <Text style={[styles.sectionText, isDark && styles.textDark]}>
                {enrichment.economic_impact}
              </Text>
            </CollapsibleSection>
          )}
          {isPro && enrichment.mip_strategy && (
            <CollapsibleSection
              title={t('diagnosis.mipStrategy')}
              icon="leaf"
              iconColor={Colors.accent}
            >
              <Text style={[styles.sectionText, isDark && styles.textDark]}>
                {enrichment.mip_strategy}
              </Text>
            </CollapsibleSection>
          )}
        </View>

        {/* MIP knowledge base card — premium-gated EMBRAPA/MAPA protocols.
            Hidden when the plant is healthy or no pest was identified. */}
        <MipCard
          knowledge={mipKnowledge}
          tier={tier}
          enabled={mipEnabled}
          onAnalyticsEvent={trackEvent}
        />

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={handleWhatsAppShare}
            activeOpacity={0.75}
            accessibilityLabel={t('diagnosis.shareWhatsApp')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.shareHint')}
            testID="result-whatsapp-button"
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFF" accessibilityElementsHidden />
            <Text style={styles.actionBtnText}>{t('diagnosis.shareWhatsApp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pdfBtn}
            onPress={handlePdfExport}
            activeOpacity={0.75}
            accessibilityLabel={
              isPro ? t('diagnosis.exportPdfA11y') : t('diagnosis.proLockedShare')
            }
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.exportPdfHint')}
            testID="result-pdf-button"
          >
            <Ionicons
              name={isPro ? 'document-text' : 'lock-closed'}
              size={20}
              color={Colors.accent}
              accessibilityElementsHidden
            />
            <Text style={[styles.actionBtnText, { color: Colors.accent }]}>
              {isPro ? t('diagnosis.exportPdf') : t('diagnosis.sharePdf')}
            </Text>
            {!isPro && (
              <View style={styles.proPillSmall}>
                <Text style={styles.proPillSmallText}>PRO</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <PremiumCard style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
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
                <Text style={[styles.detailValue, isDark && styles.textDark]}>{value}</Text>
              </View>
            ))}
        </PremiumCard>

        {/* P0-1: Mandatory CREA legal disclaimer (Lei 7.802/89) on every diagnosis */}
        <View
          style={styles.legalDisclaimer}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('diagnosis.legalDisclaimer')}
        >
          <Ionicons
            name="information-circle"
            size={16}
            color={Colors.textSecondary}
            accessibilityElementsHidden
          />
          <Text style={styles.legalDisclaimerText}>{t('diagnosis.legalDisclaimer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface TreatmentLevelRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  title: string;
  hint: string;
  count: number;
  isPro: boolean;
  proGated: boolean;
}

/**
 * One MIP level row in the treatment summary card.
 * - When `proGated && !isPro`, replaces count with a lock icon + PRO pill.
 * - Always shows the level (transparency) so the user knows what they're missing.
 */
function TreatmentLevelRow({
  icon,
  color,
  title,
  hint,
  count,
  isPro,
  proGated,
}: TreatmentLevelRowProps) {
  const locked = proGated && !isPro;
  return (
    <View
      style={styles.treatmentLevelRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        locked
          ? `${title}. ${hint}. ${count} itens. Recurso Pro.`
          : `${title}. ${hint}. ${count} itens.`
      }
    >
      <View style={[styles.treatmentLevelIcon, { backgroundColor: color + '1F' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={styles.treatmentLevelText}>
        <Text style={styles.treatmentLevelTitle}>{title}</Text>
        <Text style={styles.treatmentLevelHint} numberOfLines={1}>
          {hint}
        </Text>
      </View>
      {locked ? (
        <View style={styles.treatmentLevelLocked}>
          <Ionicons name="lock-closed" size={12} color={Colors.warmAmber} />
          <Text style={styles.treatmentLevelLockedText}>PRO</Text>
        </View>
      ) : (
        <Text style={[styles.treatmentLevelCount, { color }]}>{count}</Text>
      )}
    </View>
  );
}

const HERO_HEIGHT = 360;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  textDark: { color: Colors.textDark },
  // --- HERO ---
  heroWrap: {
    height: HERO_HEIGHT,
    backgroundColor: '#06281D',
    position: 'relative',
  },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroGradient: { ...StyleSheet.absoluteFillObject },
  heroTopRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    zIndex: 2,
  },
  heroBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
  heroPestName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  heroScientific: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
  },
  // --- Confidence bar ---
  confidenceWrap: { marginTop: 18 },
  confidenceLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  confidenceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  confidenceValue: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  confidenceTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  confidenceFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFF' },
  // --- Low confidence warning ---
  lowConfidenceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: 14,
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
    borderRadius: BorderRadius.md,
  },
  lowConfidenceText: {
    flex: 1,
    fontSize: FontSize.caption,
    color: '#78350F',
    lineHeight: 18,
    fontWeight: '600',
  },
  // --- Alternatives card ---
  alternativesWrap: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    overflow: 'hidden',
  },
  alternativesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  alternativesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  alternativesTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: Colors.text,
  },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warmAmber,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  proPillText: { color: '#FFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  alternativesList: {
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
  },
  alternativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  alternativeRowMain: { flex: 1 },
  alternativeName: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.text },
  alternativeScientific: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  alternativeConfidence: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: Colors.accent,
  },
  // --- Treatment summary card ---
  treatmentCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  treatmentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  treatmentTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: '800',
    color: Colors.text,
  },
  treatmentLevels: { gap: 10, marginBottom: 14 },
  treatmentLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  treatmentLevelIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  treatmentLevelText: { flex: 1 },
  treatmentLevelTitle: { fontSize: FontSize.subheadline, fontWeight: '700', color: Colors.text },
  treatmentLevelHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  treatmentLevelCount: {
    fontSize: FontSize.headline,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'right',
  },
  treatmentLevelLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warmAmber + '1F',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  treatmentLevelLockedText: { fontSize: 10, fontWeight: '800', color: Colors.warmAmber },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
  },
  viewDetailsBtnText: { color: '#FFF', fontSize: FontSize.subheadline, fontWeight: '700' },
  // --- Sections ---
  sections: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  sectionText: { fontSize: FontSize.subheadline, lineHeight: 22, flex: 1, color: Colors.text },
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
  // --- Details card ---
  detailTitle: {
    fontSize: FontSize.subheadline,
    fontWeight: '700',
    color: Colors.accent,
    marginBottom: 10,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  detailValue: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.text },
  // --- Error states ---
  errorCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: { fontSize: FontSize.title2, fontWeight: '700', marginBottom: 8, color: Colors.text },
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
  // --- Action buttons ---
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
  proPillSmall: {
    marginLeft: 4,
    backgroundColor: Colors.warmAmber,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  proPillSmallText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  // --- Legal disclaimer ---
  legalDisclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: 32,
    padding: 12,
    backgroundColor: Colors.systemGray5,
    borderRadius: BorderRadius.sm,
  },
  legalDisclaimerText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
