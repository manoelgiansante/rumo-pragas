import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight, Gradients } from '../constants/theme';
import { CROPS } from '../constants/crops';
import { useAuthContext } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { AppBar, IconButton, Input, Button, Chip } from '../components/ui';

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
  crops: string[];
}

function getInitials(name: string, fallbackEmail?: string | null): string {
  const source = (name || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || first.toUpperCase();
  }
  const e = (fallbackEmail || '').trim();
  return e ? e[0]!.toUpperCase() : '·';
}

export default function EditProfileScreen() {
  const isDark = useColorScheme() === 'dark';
  const { user } = useAuthContext();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    city: '',
    state: '',
    crops: [],
  });

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase
          .from('pragas_profiles')
          .select('full_name, city, state, crops')
          .eq('id', user.id)
          .single();

        if (mounted && data) {
          setProfile({
            full_name: data.full_name || '',
            city: data.city || '',
            state: data.state || '',
            crops: data.crops || [],
          });
        }
      } catch (err) {
        if (__DEV__) console.error('Failed to load profile:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const toggleCrop = useCallback((cropId: string) => {
    setProfile((prev) => ({
      ...prev,
      crops: prev.crops.includes(cropId)
        ? prev.crops.filter((c) => c !== cropId)
        : [...prev.crops, cropId],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;

    if (!profile.full_name.trim()) {
      Alert.alert(t('settings.editProfile'), t('settings.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('pragas_profiles')
        .update({
          full_name: profile.full_name.trim(),
          city: profile.city.trim() || null,
          state: profile.state || null,
          crops: profile.crops.length > 0 ? profile.crops : null,
        })
        .eq('id', user.id);

      if (error) throw error;

      // Also update auth metadata so it's available in user object
      await supabase.auth.updateUser({
        data: { full_name: profile.full_name.trim() },
      });

      Alert.alert(t('settings.editProfile'), t('settings.profileSaved'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      if (__DEV__) console.error('Failed to save profile:', err);
      Alert.alert(t('settings.editProfile'), t('settings.profileSaveError'));
    } finally {
      setSaving(false);
    }
  }, [user, profile, t]);

  const initials = useMemo(
    () => getInitials(profile.full_name, user?.email ?? null),
    [profile.full_name, user?.email],
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, isDark && styles.containerDark]}>
        <AppBar
          title={t('settings.editProfile')}
          leading={
            <IconButton
              iconName="arrow-back"
              accessibilityLabel={t('editProfile.backA11y')}
              onPress={() => router.back()}
            />
          }
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar with gradient */}
          <View style={styles.avatarBlock}>
            <LinearGradient
              colors={Gradients.tech}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text
                style={styles.avatarText}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {initials}
              </Text>
            </LinearGradient>
            <TouchableOpacity
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.changePhotoBtn}
            >
              <Text style={styles.changePhotoText}>Trocar foto</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.fieldGroup}>
            <Input
              label={t('settings.fullName')}
              value={profile.full_name}
              onChangeText={(text) => setProfile((p) => ({ ...p, full_name: text }))}
              placeholder={t('settings.fullName')}
              autoCapitalize="words"
              returnKeyType="next"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel={t('editProfile.fullNameA11y')}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Input
              label="E-mail"
              value={user?.email || ''}
              editable={false}
              accessibilityLabel={t('editProfile.emailReadOnlyA11y')}
              inputStyle={styles.inputDisabledText}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Input
              label={t('settings.city')}
              value={profile.city}
              onChangeText={(text) => setProfile((p) => ({ ...p, city: text }))}
              placeholder={t('settings.city')}
              autoCapitalize="words"
              returnKeyType="next"
              autoComplete="postal-address-locality"
              textContentType="addressCity"
              accessibilityLabel={t('editProfile.cityA11y')}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.sectionLabel}>{t('settings.state')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {BRAZILIAN_STATES.map((st) => {
                const selected = profile.state === st;
                return (
                  <Chip
                    key={st}
                    selected={selected}
                    onPress={() => setProfile((p) => ({ ...p, state: p.state === st ? '' : st }))}
                    accessibilityLabel={t('editProfile.stateSelectA11y', { state: st })}
                  >
                    {st}
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.sectionLabel}>{t('settings.crops')}</Text>
            <View style={styles.cropsGrid}>
              {CROPS.map((crop) => {
                const selected = profile.crops.includes(crop.id);
                return (
                  <TouchableOpacity
                    key={crop.id}
                    style={[
                      styles.cropChip,
                      selected && {
                        backgroundColor: crop.color + '30',
                        borderColor: crop.color,
                      },
                    ]}
                    onPress={() => toggleCrop(crop.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('editProfile.cropToggleA11y', { crop: crop.displayName })}
                    accessibilityState={{ selected }}
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
                        selected && { color: crop.color, fontWeight: FontWeight.semibold },
                      ]}
                    >
                      {crop.displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.saveBlock}>
            <Button
              variant="primary"
              size="lg"
              block
              loading={saving}
              onPress={handleSave}
              accessibilityLabel={t('editProfile.saveA11y')}
            >
              {t('settings.save')}
            </Button>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  avatarBlock: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accentDark,
    shadowOpacity: 0.28,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
  avatarText: {
    fontSize: 34,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 1,
  },
  changePhotoBtn: {
    marginTop: Spacing.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  changePhotoText: {
    fontSize: FontSize.subheadline,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  fieldGroup: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.footnote,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  inputDisabledText: {
    color: Colors.textSecondary,
  },
  chipsRow: {
    gap: 8,
    paddingRight: Spacing.lg,
  },
  cropsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cropChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
    gap: 6,
  },
  cropIcon: { fontSize: 16 },
  cropName: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
  saveBlock: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
});
