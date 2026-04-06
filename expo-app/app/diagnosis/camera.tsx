import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { PremiumCard } from '../../components/PremiumCard';

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.75;

export default function CameraScreen() {
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);

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

    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('diagnosis.permissionRequired'), t('diagnosis.cameraPermissionMsg'));
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('diagnosis.permissionRequired'), t('diagnosis.galleryPermissionMsg'));
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
        router.push({
          pathname: '/diagnosis/crop-select',
          params: { imageUri: compressed.uri, imageBase64: compressed.base64 },
        });
      } catch (error) {
        console.error('Image compression failed:', error);
        Alert.alert(t('diagnosis.imageError'), t('diagnosis.imageErrorMsg'));
      } finally {
        setProcessing(false);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeBtn}
          accessibilityLabel={t('diagnosis.closeA11y')}
          accessibilityRole="button"
          accessibilityHint={t('diagnosis.closeHint')}
        >
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Ionicons name="camera" size={16} color={Colors.accent} />
          <Text style={styles.headerText}>{t('home.diagnosePest')}</Text>
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
          </View>
        </View>

        <Text style={styles.title}>{t('diagnosis.aiTitle')}</Text>
        <Text style={styles.subtitle}>{t('diagnosis.aiSubtitle')}</Text>

        <View style={styles.buttons}>
          <TouchableOpacity
            onPress={() => pickImage(true)}
            activeOpacity={0.8}
            accessibilityLabel={t('diagnosis.takePhotoA11y')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.takePhotoHint')}
          >
            <PremiumCard>
              <View style={styles.btnRow}>
                <LinearGradient colors={Gradients.hero as any} style={styles.btnIcon}>
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
            onPress={() => pickImage(false)}
            activeOpacity={0.8}
            accessibilityLabel={t('diagnosis.chooseGalleryA11y')}
            accessibilityRole="button"
            accessibilityHint={t('diagnosis.chooseGalleryHint')}
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
        </View>

        <View style={styles.tips}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb" size={16} color={Colors.warmAmber} />
            <Text style={styles.tipsTitle}>{t('diagnosis.tipsTitle')}</Text>
          </View>
          <PremiumCard>
            {[
              { icon: 'sunny', color: '#FFD600', text: t('diagnosis.tipLight') },
              { icon: 'expand', color: '#00BCD4', text: t('diagnosis.tipFocus') },
              {
                icon: 'leaf',
                color: Colors.accent,
                text: t('diagnosis.tipInclude'),
              },
              { icon: 'image', color: Colors.techIndigo, text: t('diagnosis.tipSharp') },
            ].map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name={tip.icon as any} size={16} color={tip.color} />
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </PremiumCard>
        </View>
      </View>

      {processing && (
        <View style={styles.processingOverlay}>
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
    marginBottom: 24,
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
  tipsTitle: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.warmAmber },
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
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 12,
  },
  processingText: { fontSize: FontSize.subheadline, fontWeight: '600', color: Colors.text },
});
