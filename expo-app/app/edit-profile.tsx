import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  ReturnKeyTypeOptions,
} from 'react-native';
import { formatPhoneBR } from '../utils/phone';
// Cross-platform safe area: native per-view measurement — correct inside the
// iOS sheet (modal) and on Android edge-to-edge (clears the status bar).
import { SafeAreaView } from 'react-native-safe-area-context';
import { showAlert } from '../services/dialog';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { captureMessage } from '../services/sentry-shim';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  FontWeight,
  FontFamily,
} from '../constants/theme';
import { CROPS } from '../constants/crops';
import { useAuthContext } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import {
  getPragasAvatarSignedUrl,
  parseOwnedLegacyAvatarUrl,
  replacePragasAvatar,
} from '../services/avatar';
import { Avatar } from '../components/Avatar';
import { KeyboardDoneAccessory, DONE_ACCESSORY_ID } from '../components/KeyboardDoneAccessory';

const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

interface ProfileData {
  full_name: string;
  city: string;
  state: string;
  phone: string;
  crops: string[];
  avatar_path: string | null;
  avatar_legacy_url: string | null;
  avatar_url: string | null;
}

const AVATAR_MAX_DIM = 512;

export default function EditProfileScreen() {
  const isDark = useColorScheme() === 'dark';
  const { user } = useAuthContext();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Keyboard "Avançar"/"Próximo" focus chain: name → phone → city → done(save).
  // Without onSubmitEditing/ref wiring the return key was inert (dead key).
  const phoneRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    city: '',
    state: '',
    phone: '',
    crops: [],
    avatar_path: null,
    avatar_legacy_url: null,
    avatar_url: null,
  });

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('pragas_profiles')
          .select('full_name, city, state, phone, crops, avatar_path, avatar_url')
          .eq('user_id', user.id)
          .single();
        if (error) throw new Error('PROFILE_LOAD_FAILED');

        if (mounted && data) {
          const signedAvatar = await getPragasAvatarSignedUrl(user.id, data.avatar_path ?? null);
          const legacyAvatar = parseOwnedLegacyAvatarUrl(user.id, data.avatar_url ?? null)
            ? data.avatar_url
            : null;
          if (!mounted) return;
          setProfile({
            full_name: data.full_name || '',
            city: data.city || '',
            state: data.state || '',
            phone: data.phone || '',
            crops: data.crops || [],
            avatar_path: data.avatar_path || null,
            avatar_legacy_url: data.avatar_url || null,
            avatar_url: signedAvatar || legacyAvatar,
          });
        }
      } catch {
        if (__DEV__) console.warn('[editProfile] profile load failed');
        captureMessage('profile load failed', {
          level: 'warning',
          tags: { feature: 'editProfile.load' },
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const toggleCrop = useCallback((cropId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setProfile((prev) => ({
      ...prev,
      crops: prev.crops.includes(cropId)
        ? prev.crops.filter((c) => c !== cropId)
        : [...prev.crops, cropId],
    }));
  }, []);

  /**
   * Pick + compress + upload to private app-scoped Supabase Storage.
   */
  const uploadAvatar = useCallback(
    async (source: 'camera' | 'library') => {
      if (!user) return;
      try {
        // Câmera exige permissão; galeria usa o Android Photo Picker / iOS limited picker
        // do expo-image-picker, que NÃO exige READ_MEDIA_IMAGES (removida do manifesto por
        // política do Google Play — acesso pontual a mídia não declara a permissão ampla).
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            showAlert(t('editProfile.permissionDeniedTitle'), t('editProfile.permissionDeniedMsg'));
            return;
          }
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
              });

        if (result.canceled || !result.assets?.[0]) return;

        setUploadingAvatar(true);
        Haptics.selectionAsync().catch(() => {});

        // Downscale + recompress so we never upload multi-MB raw photos.
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: AVATAR_MAX_DIM, height: AVATAR_MAX_DIM } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );

        // Upload as ArrayBuffer (cross-platform RN-safe)
        const response = await fetch(manipulated.uri);
        const arrayBuffer = await response.arrayBuffer();
        const saved = await replacePragasAvatar({
          userId: user.id,
          bytes: arrayBuffer,
          mimeType: 'image/jpeg',
          previousPath: profile.avatar_path,
          previousLegacyUrl: profile.avatar_legacy_url,
        });

        setProfile((p) => ({
          ...p,
          avatar_path: saved.path,
          avatar_legacy_url: null,
          avatar_url: saved.signedUrl ?? manipulated.uri,
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch {
        if (__DEV__) console.warn('[editProfile] avatar upload failed');
        captureMessage('avatar upload failed', {
          level: 'warning',
          tags: { feature: 'editProfile.avatarUpload' },
        });
        showAlert(t('common.error'), t('editProfile.avatarUploadError'));
      } finally {
        setUploadingAvatar(false);
      }
    },
    [profile.avatar_legacy_url, profile.avatar_path, user, t],
  );

  const handleAvatarPress = useCallback(() => {
    if (uploadingAvatar) return;
    const options = [t('editProfile.avatarTakePhoto'), t('editProfile.avatarChooseLibrary')];

    if (Platform.OS === 'ios') {
      const buttons = [...options, t('common.cancel')];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: buttons,
          cancelButtonIndex: options.length,
          title: t('editProfile.avatarSheetTitle'),
        },
        (index) => {
          if (index === 0) uploadAvatar('camera');
          else if (index === 1) uploadAvatar('library');
        },
      );
    } else {
      showAlert(t('editProfile.avatarSheetTitle'), undefined, [
        { text: options[0], onPress: () => uploadAvatar('camera') },
        { text: options[1], onPress: () => uploadAvatar('library') },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  }, [uploadingAvatar, uploadAvatar, t]);

  const handleSave = useCallback(async () => {
    // Re-entrancy guard: the in-flight request might not have flipped `saving`
    // (and thus the header button's `disabled`) before a second tap lands.
    if (!user || saving) return;

    if (!profile.full_name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert(t('settings.editProfile'), t('settings.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      // upsert (not update) so the first-ever profile save self-heals when the
      // pragas_profiles row was never created (e.g. signup before the row trigger
      // existed / a social-login path that skipped row creation). A plain
      // `.update().eq('id', ...)` against a missing row affects 0 rows and
      // returns NO error — the user sees "profile saved" but nothing persists
      // (silent CRUD-edit failure). Upsert is idempotent: identical result when
      // the row already exists, creates it when absent.
      const { error } = await supabase.from('pragas_profiles').upsert(
        {
          user_id: user.id,
          full_name: profile.full_name.trim(),
          city: profile.city.trim() || null,
          state: profile.state || null,
          phone: profile.phone.trim() || null,
          crops: profile.crops.length > 0 ? profile.crops : null,
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;

      await supabase.auth.updateUser({
        data: { full_name: profile.full_name.trim() },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      showAlert(t('settings.editProfile'), t('settings.profileSaved'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      if (__DEV__) console.warn('[editProfile] profile save failed');
      captureMessage('profile save failed', {
        level: 'warning',
        tags: { feature: 'editProfile.save' },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert(t('settings.editProfile'), t('settings.profileSaveError'));
    } finally {
      setSaving(false);
    }
  }, [user, saving, profile, t]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const userName = profile.full_name || user?.user_metadata?.full_name || '?';

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: isDark ? Colors.backgroundDark : Colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, isDark && styles.headerDark]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.backA11y')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="edit-profile-back"
          >
            <Ionicons name="chevron-back" size={26} color={Colors.accent} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, isDark && styles.textDark]}
            accessibilityRole="header"
            numberOfLines={1}
          >
            {t('settings.editProfile')}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={styles.saveBtn}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.saveA11y')}
            accessibilityState={{ disabled: saving, busy: saving }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            testID="edit-profile-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Text style={styles.saveBtnText}>{t('settings.save')}</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar editor */}
          <View style={styles.avatarBlock}>
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('editProfile.avatarChangeA11y')}
              testID="edit-profile-avatar"
              style={styles.avatarTouch}
            >
              <Avatar uri={profile.avatar_url} name={userName} size={104} />
              <View style={styles.avatarBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="camera" size={16} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={[styles.avatarHint, isDark && styles.textMuted]}>
              {t('editProfile.avatarHint')}
            </Text>
          </View>

          {/* Personal info card */}
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Field
              isDark={isDark}
              label={t('settings.fullName')}
              value={profile.full_name}
              onChangeText={(text) => setProfile((p) => ({ ...p, full_name: text }))}
              placeholder={t('editProfile.fullNamePlaceholder')}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              a11yLabel={t('editProfile.fullNameA11y')}
              required
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              blurOnSubmit={false}
              testID="edit-profile-input-name"
            />
            <Separator />
            <Field
              isDark={isDark}
              label="Email"
              value={user?.email || ''}
              disabled
              a11yLabel={t('editProfile.emailReadOnlyA11y')}
            />
            <Separator />
            <Field
              isDark={isDark}
              inputRef={phoneRef}
              label={t('editProfile.phone')}
              value={profile.phone}
              onChangeText={(text) => setProfile((p) => ({ ...p, phone: formatPhoneBR(text) }))}
              placeholder="(11) 9 9999-9999"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              a11yLabel={t('editProfile.phoneA11y')}
              returnKeyType="next"
              onSubmitEditing={() => cityRef.current?.focus()}
              blurOnSubmit={false}
              testID="edit-profile-input-phone"
            />
          </View>

          {/* Location card */}
          <View style={[styles.card, isDark && styles.cardDark]}>
            <Field
              isDark={isDark}
              inputRef={cityRef}
              label={t('settings.city')}
              value={profile.city}
              onChangeText={(text) => setProfile((p) => ({ ...p, city: text }))}
              placeholder={t('editProfile.cityPlaceholder')}
              autoCapitalize="words"
              autoComplete="postal-address-locality"
              textContentType="addressCity"
              a11yLabel={t('editProfile.cityA11y')}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              testID="edit-profile-input-city"
            />
            <Separator />
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>
                {t('settings.state')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stateChipRow}
              >
                {BRAZILIAN_STATES.map((st) => {
                  const selected = profile.state === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[styles.stateChip, selected && styles.stateChipActive]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setProfile((p) => ({ ...p, state: p.state === st ? '' : st }));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('editProfile.stateSelectA11y', { state: st })}
                      accessibilityState={{ selected }}
                      testID={`edit-profile-state-${st}`}
                    >
                      <Text style={[styles.stateChipText, selected && styles.stateChipTextActive]}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Crops */}
          <Text style={[styles.sectionTitle, isDark && styles.textMuted]}>
            {t('settings.crops')}
          </Text>
          <View style={styles.cropsGrid}>
            {CROPS.map((crop) => {
              const selected = profile.crops.includes(crop.id);
              return (
                <TouchableOpacity
                  key={crop.id}
                  style={[
                    styles.cropChip,
                    isDark && styles.cropChipDark,
                    selected && {
                      backgroundColor: crop.color + '30',
                      borderColor: crop.color,
                    },
                  ]}
                  onPress={() => toggleCrop(crop.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('editProfile.cropToggleA11y', { crop: crop.displayName })}
                  accessibilityState={{ selected }}
                  testID={`edit-profile-crop-${crop.id}`}
                >
                  <Text
                    style={styles.cropIcon}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    {crop.icon}
                  </Text>
                  <Text
                    style={[
                      styles.cropName,
                      isDark && styles.textDark,
                      selected && {
                        color: crop.color,
                        fontFamily: FontFamily.bold,
                        fontWeight: FontWeight.bold,
                      },
                    ]}
                  >
                    {crop.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Renders a "Concluir" toolbar above number-style keyboards on iOS. */}
        <KeyboardDoneAccessory />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================================
// Field primitive (iOS-style grouped inset)
// ============================================================================

interface FieldProps {
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  placeholder?: string;
  isDark: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'name' | 'tel' | 'postal-address-locality' | 'email' | 'off';
  textContentType?: 'name' | 'telephoneNumber' | 'addressCity' | 'emailAddress';
  disabled?: boolean;
  required?: boolean;
  a11yLabel?: string;
  testID?: string;
  inputRef?: React.RefObject<TextInput | null>;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  blurOnSubmit?: boolean;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  isDark,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  disabled,
  required,
  a11yLabel,
  testID,
  inputRef,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: FieldProps) {
  // Number-style keyboards (phone-pad/numeric) have no return key on iOS, so
  // attach the shared "Concluir" accessory toolbar to let the user dismiss it.
  const needsDoneAccessory =
    Platform.OS === 'ios' && (keyboardType === 'phone-pad' || keyboardType === 'numeric');

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, isDark && styles.inputDark, disabled && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.systemGray3}
        editable={!disabled}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType ?? 'next'}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        inputAccessoryViewID={needsDoneAccessory ? DONE_ACCESSORY_ID : undefined}
        accessibilityLabel={a11yLabel ?? label}
        accessibilityState={disabled ? { disabled: true } : undefined}
        testID={testID}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: Colors.backgroundDark },
  scrollContent: { paddingBottom: Spacing.xxxl },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  headerDark: { backgroundColor: Colors.backgroundDark, borderBottomColor: Colors.separatorDark },
  backBtn: { padding: Spacing.xs, minWidth: 48 },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.headline,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    color: Colors.text,
  },
  saveBtn: { padding: Spacing.xs, minWidth: 60, alignItems: 'flex-end' },
  saveBtnText: {
    fontSize: FontSize.body,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
  },

  // Avatar
  avatarBlock: { alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.lg },
  avatarTouch: { position: 'relative' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.background,
  },
  avatarHint: {
    marginTop: 12,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },

  // Grouped card (iOS inset)
  card: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  cardDark: { backgroundColor: '#1C1C1E' },

  field: { paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  fieldLabel: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.text,
    paddingVertical: 6,
    minHeight: 28,
  },
  inputDark: { color: Colors.textDark },
  inputDisabled: { color: Colors.textSecondary, opacity: 0.7 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
    marginLeft: Spacing.lg,
  },

  // State chips
  stateChipRow: { gap: 8, paddingRight: Spacing.lg, paddingVertical: 4 },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  stateChipActive: { backgroundColor: Colors.accent + '20', borderColor: Colors.accent },
  stateChipText: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.medium,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  stateChipTextActive: {
    color: Colors.accent,
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
  },

  // Crops section
  sectionTitle: {
    fontSize: FontSize.caption,
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.xxl,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.sm,
  },
  cropsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.lg,
  },
  cropChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
    gap: 6,
    minHeight: 40,
  },
  cropChipDark: { backgroundColor: '#1C1C1E', borderColor: '#2A2A2C' },
  cropIcon: { fontSize: 18 },
  cropName: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },

  textDark: { color: Colors.textDark },
  textMuted: { color: Colors.systemGray },
});
