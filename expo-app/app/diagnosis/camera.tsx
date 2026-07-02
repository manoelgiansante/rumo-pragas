import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';
import { UsageCounter } from '../../components/UsageCounter';
import { VoiceRecorderButton } from '../../components/VoiceRecorderButton';
import { useDiagnosis } from '../../contexts/DiagnosisContext';
import { addBreadcrumb, captureException } from '../../services/sentry-shim';

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.75;

export default function CameraScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [processing, setProcessing] = useState(false);
  const { setImage, appendNotes } = useDiagnosis();

  const compressImage = async (uri: string): Promise<{ uri: string; base64: string }> => {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG, base64: true },
    );
    if (!result.base64) {
      throw new Error(t('diagnosis.base64Error'));
    }
    return { uri: result.uri, base64: result.base64 };
  };

  const pickImage = async (useCamera: boolean) => {
    // Idempotency guard: never let processing overlap with re-entry.
    if (processing) return;
    // Medium impact on the capture path (camera) gives a more "premium" tactile
    // feedback than the previous Light. Gallery selection keeps Light because
    // the user expects a quieter affordance for "pick existing photo".
    Haptics.impactAsync(
      useCamera ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    addBreadcrumb({
      category: 'diagnosis.camera',
      message: useCamera ? 'open_camera_tapped' : 'open_gallery_tapped',
      level: 'info',
    });

    // P0: when permission denied (especially canAskAgain=false), give the user a
    // direct "Open Settings" CTA instead of a dead-end Alert. Apple reviewer that
    // accidentally taps "Don't Allow" on a fresh install needs a recovery path —
    // otherwise the core flow is gated behind a system Settings deep dive.
    const showPermissionAlert = (msg: string) => {
      showAlert(t('diagnosis.permissionRequired'), msg, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('diagnosis.openSettings'),
          onPress: () => {
            Linking.openSettings().catch(() => {
              /* best effort */
            });
          },
        },
      ]);
    };

    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        addBreadcrumb({
          category: 'diagnosis.camera',
          message: 'camera_permission_denied',
          level: 'warning',
        });
        showPermissionAlert(t('diagnosis.cameraPermissionMsg'));
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        addBreadcrumb({
          category: 'diagnosis.camera',
          message: 'gallery_permission_denied',
          level: 'warning',
        });
        showPermissionAlert(t('diagnosis.galleryPermissionMsg'));
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
      allowsEditing: true,
    };

    const result = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      setProcessing(true);
      try {
        const compressed = await compressImage(asset.uri);
        addBreadcrumb({
          category: 'diagnosis.camera',
          message: 'image_compressed',
          level: 'info',
          data: {
            base64Length: compressed.base64.length,
            estimatedBytes: Math.ceil((compressed.base64.length * 3) / 4),
          },
        });
        // Success haptic so the user knows the heavy lift is done and we're
        // moving to the next step.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setImage(compressed.uri, compressed.base64);
        router.push('/diagnosis/crop-select');
      } catch (error) {
        if (__DEV__) console.error('Image compression failed:', error);
        captureException(error, {
          tags: { feature: 'diagnosis', action: 'image_compression', stage: 'image_compression' },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        showAlert(t('diagnosis.imageError'), t('diagnosis.imageErrorMsg'));
      } finally {
        setProcessing(false);
      }
    } else {
      addBreadcrumb({
        category: 'diagnosis.camera',
        message: 'picker_cancelled',
        level: 'info',
      });
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="diagnosis-camera-close"
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityLabel={t('diagnosis.closeA11y')}
          accessibilityRole="button"
          accessibilityHint={t('diagnosis.closeHint')}
        >
          <Ionicons name="close" size={22} color={isDark ? Colors.textDark : Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="camera" size={16} color={Colors.accent} />
          <Text style={[styles.headerText, isDark && styles.textDark]}>
            {t('home.diagnosePest')}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconRing, { width: 150, height: 150 }]}>
            <View
              style={[
                styles.iconRing,
                { width: 120, height: 120, borderColor: Colors.accent + '33' },
              ]}
            >
              <Ionicons name="camera" size={48} color={Colors.accent} />
            </View>
            {/* Corner brackets: subtle framing guide — "frame the leaf in the center" */}
            <View style={[styles.frameCorner, styles.frameCornerTL]} pointerEvents="none" />
            <View style={[styles.frameCorner, styles.frameCornerTR]} pointerEvents="none" />
            <View style={[styles.frameCorner, styles.frameCornerBL]} pointerEvents="none" />
            <View style={[styles.frameCorner, styles.frameCornerBR]} pointerEvents="none" />
          </View>
        </View>

        <Text style={[styles.title, isDark && styles.textDark]}>{t('diagnosis.aiTitle')}</Text>
        <Text style={styles.subtitle}>{t('diagnosis.aiSubtitle')}</Text>

        <View style={styles.frameGuide} accessible accessibilityRole="text">
          <Ionicons name="scan-outline" size={16} color={Colors.accent} />
          <Text style={styles.frameGuideText}>{t('diagnosis.frameLeafGuide')}</Text>
          <Text style={styles.frameGuideDot}>·</Text>
          <Ionicons name="sunny-outline" size={14} color={Colors.warmAmber} />
          <Text style={styles.frameGuideHint}>{t('diagnosis.frameLeafHint')}</Text>
        </View>

        {/* Premium gate: monthly usage pill (free=3/mo, pro=30/mo, enterprise=hidden) */}
        <UsageCounter />

        <View style={styles.buttons}>
          <TouchableOpacity
            testID="diagnosis-camera-capture"
            onPress={() => pickImage(true)}
            disabled={processing}
            activeOpacity={0.8}
            accessibilityLabel={t('diagnosis.takePhotoA11y')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.takePhotoHint')}
            accessibilityState={{ disabled: processing, busy: processing }}
          >
            <PremiumCard>
              <View style={styles.btnRow}>
                <LinearGradient colors={Gradients.hero} style={styles.btnIcon}>
                  <Ionicons name="camera" size={24} color="#FFF" accessibilityElementsHidden />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.btnTitle}>{t('diagnosis.takePhoto')}</Text>
                  <Text style={styles.btnSub}>{t('diagnosis.takePhotoSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.systemGray3} />
              </View>
            </PremiumCard>
          </TouchableOpacity>

          <TouchableOpacity
            testID="diagnosis-camera-gallery"
            onPress={() => pickImage(false)}
            disabled={processing}
            activeOpacity={0.8}
            accessibilityLabel={t('diagnosis.chooseGalleryA11y')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.chooseGalleryHint')}
            accessibilityState={{ disabled: processing, busy: processing }}
          >
            <PremiumCard>
              <View style={styles.btnRow}>
                <LinearGradient
                  colors={[Colors.techBlue, Colors.techBlue + 'CC']}
                  style={styles.btnIcon}
                >
                  <Ionicons name="images" size={24} color="#FFF" accessibilityElementsHidden />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.btnTitle}>{t('diagnosis.chooseGallery')}</Text>
                  <Text style={styles.btnSub}>{t('diagnosis.chooseGallerySub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.systemGray3} />
              </View>
            </PremiumCard>
          </TouchableOpacity>

          {/*
            Voice push-to-talk — feature-flagged by EXPO_PUBLIC_VOICE_ENABLED.
            Returns null when flag is OFF (default). When ON, the transcript is
            appended to `DiagnosisContext.notes` (initially empty) so downstream
            screens (result.tsx) can surface the user-dictated description.
            Existing button placement and copy are UNCHANGED — ZERO-N is
            preserved by the null short-circuit and the additive append.
          */}
          <VoiceRecorderButton
            context="diagnosis_camera"
            language="pt"
            style={{ marginTop: Spacing.sm }}
            testID="diagnosis-voice-recorder"
            onTranscribed={appendNotes}
          />
        </View>

        <View style={styles.tips}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={16} color={Colors.warmAmber} />
            <Text style={styles.tipsTitle}>{t('diagnosis.tipsTitle')}</Text>
          </View>
          <PremiumCard>
            {[
              { icon: 'sunny', color: Colors.warmAmber, text: t('diagnosis.tipLight') },
              { icon: 'expand', color: Colors.info, text: t('diagnosis.tipFocus') },
              {
                icon: 'leaf',
                color: Colors.accent,
                text: t('diagnosis.tipInclude'),
              },
              { icon: 'image', color: Colors.techIndigo, text: t('diagnosis.tipSharp') },
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow} accessible accessibilityLabel={tip.text}>
                <Ionicons
                  name={tip.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={tip.color}
                  accessibilityElementsHidden
                />
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </PremiumCard>
        </View>
      </View>

      {processing && (
        <View
          style={styles.processingOverlay}
          accessible
          accessibilityLabel={t('diagnosis.optimizing')}
          accessibilityRole="progressbar"
        >
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.processingText}>{t('diagnosis.optimizing')}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  textDark: { color: Colors.textDark },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.systemGray6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { fontSize: FontSize.headline, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: Spacing.lg, alignItems: 'center' },
  iconContainer: { marginTop: 20, marginBottom: 20 },
  iconRing: {
    borderWidth: 2,
    borderColor: Colors.accent + '1A',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: FontSize.title, fontWeight: '700', marginBottom: 8 },
  subtitle: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  frameCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: Colors.accent,
  },
  frameCornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  frameCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  frameCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  frameCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  frameGuide: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent + '10',
    marginBottom: 20,
  },
  frameGuideText: {
    fontSize: FontSize.caption,
    color: Colors.accent,
    fontWeight: '600',
  },
  frameGuideDot: {
    fontSize: FontSize.caption,
    color: Colors.systemGray3,
    fontWeight: '700',
  },
  frameGuideHint: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  buttons: { width: '100%', gap: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  btnIcon: {
    width: 54,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTitle: { fontSize: FontSize.headline, fontWeight: '600' },
  btnSub: { fontSize: FontSize.caption, color: Colors.textSecondary, marginTop: 2 },
  tips: { width: '100%', marginTop: 24 },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  tipsTitle: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.earthText },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  tipText: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  processingCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 12,
  },
  processingText: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.text },
});
