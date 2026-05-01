import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors, BorderRadius, FontSize, FontWeight } from '../../constants/theme';
import { IconButton } from '../../components/ui';
import { useDiagnosis } from '../../contexts/DiagnosisContext';

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.75;

export default function CameraScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [processing, setProcessing] = useState(false);
  const { setImage } = useDiagnosis();

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // P0: when permission denied (especially canAskAgain=false), give the user a
    // direct "Open Settings" CTA instead of a dead-end Alert. Apple reviewer that
    // accidentally taps "Don't Allow" on a fresh install needs a recovery path —
    // otherwise the core flow is gated behind a system Settings deep dive.
    const showPermissionAlert = (msg: string) => {
      Alert.alert(t('diagnosis.permissionRequired'), msg, [
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
        showPermissionAlert(t('diagnosis.cameraPermissionMsg'));
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
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
        setImage(compressed.uri, compressed.base64);
        router.push('/diagnosis/crop-select');
      } catch (error) {
        if (__DEV__) console.error('Image compression failed:', error);
        Alert.alert(t('diagnosis.imageError'), t('diagnosis.imageErrorMsg'));
      } finally {
        setProcessing(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Full-screen camera-like backdrop with corner framing guides.
          Live <CameraView> is launched by ImagePicker on shutter; this screen
          is the entry/overlay surface that stays consistent with the design. */}
      <View style={styles.viewport} pointerEvents="none">
        {/* Corner framing brackets — "frame the leaf in the center" */}
        <View style={styles.frame}>
          <View style={[styles.frameCorner, styles.frameCornerTL]} />
          <View style={[styles.frameCorner, styles.frameCornerTR]} />
          <View style={[styles.frameCorner, styles.frameCornerBL]} />
          <View style={[styles.frameCorner, styles.frameCornerBR]} />
        </View>
      </View>

      {/* Top overlay: close button + guidance copy */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <IconButton
            iconName="close"
            tone="onHero"
            accessibilityLabel={t('diagnosis.closeA11y')}
            accessibilityHint={t('diagnosis.closeHint')}
            onPress={() => router.back()}
          />
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.guidance} accessibilityRole="text" maxFontSizeMultiplier={1.4}>
          {t('diagnosis.frameLeafGuide')}
        </Text>
      </View>

      {/* Bottom overlay: shutter (primary) + Galeria (ghost white) */}
      <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.controlsRow}>
          {/* Spacer left to keep shutter centred */}
          <View style={styles.galleryWrap}>
            <Pressable
              onPress={() => pickImage(false)}
              accessibilityRole="button"
              accessibilityLabel={t('diagnosis.chooseGalleryA11y')}
              accessibilityHint={t('diagnosis.chooseGalleryHint')}
              style={({ pressed }) => [styles.galleryBtn, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Ionicons name="images-outline" size={18} color="#FFF" />
              <Text style={styles.galleryText}>{t('diagnosis.chooseGallery')}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => pickImage(true)}
            accessibilityRole="button"
            accessibilityLabel={t('diagnosis.takePhotoA11y')}
            accessibilityHint={t('diagnosis.takePhotoHint')}
            style={({ pressed }) => [styles.shutterOuter, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.shutterInner} />
          </Pressable>

          {/* Right-side spacer (matches gallery width to keep shutter centred) */}
          <View style={styles.galleryWrap} pointerEvents="none" />
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
    </View>
  );
}

const FRAME_INSET = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Deep matte backdrop — evokes camera viewport without requiring a live feed
    backgroundColor: '#0A130F',
  },
  // Full-bleed viewport "view" — the camera surface is full-screen
  viewport: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    position: 'absolute',
    top: '22%',
    bottom: '28%',
    left: FRAME_INSET,
    right: FRAME_INSET,
  },
  frameCorner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  frameCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  frameCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  frameCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  frameCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  topOverlay: {
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  // Spec: "Aponte a câmera para a folha afetada" 15/600 white
  guidance: {
    fontSize: FontSize.subheadline, // 15
    fontWeight: FontWeight.semibold, // 600
    color: '#FFF',
    textAlign: 'center',
    letterSpacing: -0.1,
    paddingHorizontal: 12,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Spec: shutter 72×72 white circle
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 8,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  galleryWrap: {
    width: 110,
    alignItems: 'flex-start',
  },
  // Spec: "Galeria" ghost white button
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  galleryText: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: '#FFF',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  processingCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: 28,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  processingText: {
    fontSize: FontSize.subheadline,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
});
