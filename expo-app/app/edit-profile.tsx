import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize } from '../constants/theme';
import { CROPS } from '../constants/crops';
import { useAuthContext } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

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

    (async () => {
      try {
        const { data } = await supabase
          .from('pragas_profiles')
          .select('full_name, city, state, crops')
          .eq('id', user.id)
          .single();

        if (data) {
          setProfile({
            full_name: data.full_name || '',
            city: data.city || '',
            state: data.state || '',
            crops: data.crops || [],
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    })();
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
      console.error('Failed to save profile:', err);
      Alert.alert(t('settings.editProfile'), t('settings.profileSaveError'));
    } finally {
      setSaving(false);
    }
  }, [user, profile, t]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.accent} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>
            {t('settings.editProfile')}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Text style={styles.saveBtnText}>{t('settings.save')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>
            {t('settings.fullName')}
          </Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={profile.full_name}
            onChangeText={(text) => setProfile((p) => ({ ...p, full_name: text }))}
            placeholder={t('settings.fullName')}
            placeholderTextColor={Colors.systemGray3}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* City */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>{t('settings.city')}</Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={profile.city}
            onChangeText={(text) => setProfile((p) => ({ ...p, city: text }))}
            placeholder={t('settings.city')}
            placeholderTextColor={Colors.systemGray3}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* State */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>{t('settings.state')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stateScroll}>
            {BRAZILIAN_STATES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.stateChip, profile.state === st && styles.stateChipActive]}
                onPress={() => setProfile((p) => ({ ...p, state: p.state === st ? '' : st }))}
              >
                <Text
                  style={[styles.stateChipText, profile.state === st && styles.stateChipTextActive]}
                >
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Crops */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>{t('settings.crops')}</Text>
          <View style={styles.cropsGrid}>
            {CROPS.map((crop) => {
              const selected = profile.crops.includes(crop.id);
              return (
                <TouchableOpacity
                  key={crop.id}
                  style={[
                    styles.cropChip,
                    selected && { backgroundColor: crop.color + '30', borderColor: crop.color },
                  ]}
                  onPress={() => toggleCrop(crop.id)}
                >
                  <Text style={styles.cropIcon}>{crop.icon}</Text>
                  <Text
                    style={[styles.cropName, selected && { color: crop.color, fontWeight: '600' }]}
                  >
                    {crop.displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Email (read-only) */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, isDark && styles.textMuted]}>Email</Text>
          <View style={[styles.input, styles.inputDisabled, isDark && styles.inputDark]}>
            <Text style={[styles.inputDisabledText, isDark && styles.textMuted]}>
              {user?.email || ''}
            </Text>
          </View>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backBtn: { padding: Spacing.xs },
  headerTitle: {
    fontSize: FontSize.headline,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  saveBtn: { padding: Spacing.xs, minWidth: 60, alignItems: 'flex-end' },
  saveBtnText: {
    fontSize: FontSize.body,
    fontWeight: '600',
    color: Colors.accent,
  },
  fieldGroup: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  fieldLabel: {
    fontSize: FontSize.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    fontSize: FontSize.body,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  inputDark: {
    backgroundColor: '#1C1C1E',
    borderColor: '#333',
    color: Colors.textDark,
  },
  inputDisabled: {
    justifyContent: 'center',
    opacity: 0.6,
  },
  inputDisabledText: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  stateScroll: {
    flexDirection: 'row',
  },
  stateChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
    marginRight: 8,
  },
  stateChipActive: {
    backgroundColor: Colors.accent + '20',
    borderColor: Colors.accent,
  },
  stateChipText: {
    fontSize: FontSize.caption,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  stateChipTextActive: {
    color: Colors.accent,
    fontWeight: '700',
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
  cropName: { fontSize: FontSize.caption, color: Colors.textSecondary },
  textDark: { color: Colors.textDark },
  textMuted: { color: Colors.systemGray },
});
