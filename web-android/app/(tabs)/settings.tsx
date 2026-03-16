import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTheme } from '../../src/utils/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { SupabaseService } from '../../src/services/supabaseService';
import { UserProfile, SubscriptionPlanType } from '../../src/types';
import { getSubscriptionPlan } from '../../src/types/helpers';
import { CROPS, CropInfo } from '../../src/types/cropData';

const BR_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const ROLES = [
  { value: 'producer', label: 'Produtor Rural' },
  { value: 'agronomist', label: 'Agrônomo' },
  { value: 'technician', label: 'Técnico Agrícola' },
  { value: 'student', label: 'Estudante' },
  { value: 'researcher', label: 'Pesquisador' },
  { value: 'other', label: 'Outro' },
];

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const { accessToken, currentUser, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Edit profile state
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('producer');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('SP');
  const [editCrops, setEditCrops] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  // Paywall state
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>('basico');

  const loadProfile = useCallback(async () => {
    if (!accessToken || !currentUser?.id) return;
    try {
      const p = await SupabaseService.fetchProfile(accessToken, currentUser.id);
      if (p) {
        setProfile(p as UserProfile);
        setDarkMode(p.dark_mode ?? false);
        setPushEnabled(p.push_enabled ?? true);
      }
    } catch {}
    setLoading(false);
  }, [accessToken, currentUser?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSignOut = () => {
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  const openEditProfile = () => {
    setEditName(profile?.full_name || currentUser?.user_metadata?.full_name || '');
    setEditRole(profile?.role || 'producer');
    setEditCity(profile?.city || '');
    setEditState(profile?.state || 'SP');
    setEditCrops(profile?.crops || []);
    setEditModalVisible(true);
  };

  const saveProfile = async () => {
    if (!accessToken || !currentUser?.id) return;
    setSaving(true);
    try {
      await SupabaseService.updateProfile(accessToken, currentUser.id, {
        full_name: editName,
        role: editRole,
        city: editCity,
        state: editState,
        crops: editCrops,
      });
      setProfile((prev) =>
        prev
          ? { ...prev, full_name: editName, role: editRole, city: editCity, state: editState, crops: editCrops }
          : prev,
      );
      setEditModalVisible(false);
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível salvar o perfil.');
    }
    setSaving(false);
  };

  const toggleCrop = (key: string) => {
    setEditCrops((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  };

  const toggleDarkMode = async (value: boolean) => {
    setDarkMode(value);
    if (accessToken && currentUser?.id) {
      try {
        await SupabaseService.updateProfile(accessToken, currentUser.id, { dark_mode: value });
      } catch {}
    }
  };

  const togglePush = async (value: boolean) => {
    setPushEnabled(value);
    if (accessToken && currentUser?.id) {
      try {
        await SupabaseService.updateProfile(accessToken, currentUser.id, { push_enabled: value });
      } catch {}
    }
  };

  const userName = profile?.full_name || currentUser?.user_metadata?.full_name || 'Usuário';
  const userEmail = currentUser?.email || '';
  const userInitial = userName.charAt(0).toUpperCase();
  const roleLabel = ROLES.find((r) => r.value === (profile?.role || 'producer'))?.label || 'Produtor Rural';
  const currentPlan = getSubscriptionPlan('free');

  const renderSettingsRow = (icon: string, title: string, subtitle?: string, onPress?: () => void, rightComponent?: React.ReactNode) => (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} disabled={!onPress && !rightComponent} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.settingsRowIcon}>
        <MaterialCommunityIcons name={icon as any} size={20} color={AppTheme.accent} />
      </View>
      <View style={styles.settingsRowContent}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>}
      </View>
      {rightComponent || (onPress && <MaterialCommunityIcons name="chevron-right" size={20} color={AppTheme.textTertiary} />)}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppTheme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Configurações</Text>
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userInitial}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{userName}</Text>
              <Text style={styles.profileEmail}>{userEmail}</Text>
              <View style={styles.roleBadge}>
                <MaterialCommunityIcons name="account-outline" size={12} color={AppTheme.accent} />
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.editProfileBtn} onPress={openEditProfile} activeOpacity={0.7}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={AppTheme.accent} />
            <Text style={styles.editProfileBtnText}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>

        {/* Subscription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assinatura</Text>
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <MaterialCommunityIcons name="crown-outline" size={24} color={AppTheme.warmAmber} />
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionPlan}>{currentPlan.displayName}</Text>
                <Text style={styles.subscriptionPrice}>{currentPlan.price}</Text>
              </View>
            </View>
            <View style={styles.subscriptionFeatures}>
              {currentPlan.features.map((feat, i) => (
                <View key={i} style={styles.featureRow}>
                  <MaterialCommunityIcons name="check" size={14} color={AppTheme.accent} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => setPaywallVisible(true)} activeOpacity={0.7}>
              <MaterialCommunityIcons name="rocket-launch-outline" size={16} color="#FFFFFF" />
              <Text style={styles.upgradeBtnText}>Fazer Upgrade</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aparência</Text>
          <View style={styles.card}>
            {renderSettingsRow('theme-light-dark', 'Modo Escuro', undefined, undefined,
              <Switch value={darkMode} onValueChange={toggleDarkMode} trackColor={{ false: AppTheme.border, true: AppTheme.accent }} thumbColor="#FFFFFF" />,
            )}
            {renderSettingsRow('translate', 'Idioma', 'Português (Brasil)')}
            {renderSettingsRow('bell-outline', 'Notificações Push', undefined, undefined,
              <Switch value={pushEnabled} onValueChange={togglePush} trackColor={{ false: AppTheme.border, true: AppTheme.accent }} thumbColor="#FFFFFF" />,
            )}
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobre</Text>
          <View style={styles.card}>
            {renderSettingsRow('shield-lock-outline', 'Política de Privacidade', undefined, () => Linking.openURL('https://rumopragas.com/privacidade'))}
            {renderSettingsRow('file-document-outline', 'Termos de Uso', undefined, () => Linking.openURL('https://rumopragas.com/termos'))}
            {renderSettingsRow('information-outline', 'Versão', APP_VERSION)}
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <MaterialCommunityIcons name="logout" size={20} color={AppTheme.coral} />
          <Text style={styles.signOutBtnText}>Sair da Conta</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Editar Perfil</Text>
            <TouchableOpacity onPress={saveProfile} disabled={saving} style={styles.modalSaveBtn}>
              {saving ? (
                <ActivityIndicator size="small" color={AppTheme.accent} />
              ) : (
                <Text style={styles.modalSaveText}>Salvar</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBodyContent}>
            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Nome Completo</Text>
              <TextInput
                style={styles.formInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Seu nome"
                placeholderTextColor={AppTheme.textTertiary}
              />
            </View>

            {/* Role */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Função</Text>
              <TouchableOpacity style={styles.formPicker} onPress={() => setShowRolePicker(!showRolePicker)}>
                <Text style={styles.formPickerText}>{ROLES.find((r) => r.value === editRole)?.label || 'Selecionar'}</Text>
                <MaterialCommunityIcons name={showRolePicker ? 'chevron-up' : 'chevron-down'} size={20} color={AppTheme.textSecondary} />
              </TouchableOpacity>
              {showRolePicker && (
                <View style={styles.pickerDropdown}>
                  {ROLES.map((role) => (
                    <TouchableOpacity
                      key={role.value}
                      style={[styles.pickerOption, editRole === role.value && styles.pickerOptionActive]}
                      onPress={() => { setEditRole(role.value); setShowRolePicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, editRole === role.value && styles.pickerOptionTextActive]}>{role.label}</Text>
                      {editRole === role.value && <MaterialCommunityIcons name="check" size={16} color={AppTheme.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* City */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Cidade</Text>
              <TextInput
                style={styles.formInput}
                value={editCity}
                onChangeText={setEditCity}
                placeholder="Sua cidade"
                placeholderTextColor={AppTheme.textTertiary}
              />
            </View>

            {/* State */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Estado</Text>
              <TouchableOpacity style={styles.formPicker} onPress={() => setShowStatePicker(!showStatePicker)}>
                <Text style={styles.formPickerText}>{editState}</Text>
                <MaterialCommunityIcons name={showStatePicker ? 'chevron-up' : 'chevron-down'} size={20} color={AppTheme.textSecondary} />
              </TouchableOpacity>
              {showStatePicker && (
                <View style={styles.pickerDropdown}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {BR_STATES.map((st) => (
                      <TouchableOpacity
                        key={st}
                        style={[styles.pickerOption, editState === st && styles.pickerOptionActive]}
                        onPress={() => { setEditState(st); setShowStatePicker(false); }}
                      >
                        <Text style={[styles.pickerOptionText, editState === st && styles.pickerOptionTextActive]}>{st}</Text>
                        {editState === st && <MaterialCommunityIcons name="check" size={16} color={AppTheme.accent} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Crops */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Culturas</Text>
              <View style={styles.cropsGrid}>
                {CROPS.map((crop) => {
                  const isSelected = editCrops.includes(crop.key);
                  return (
                    <TouchableOpacity
                      key={crop.key}
                      style={[styles.cropToggle, isSelected && { backgroundColor: crop.accentColor + '20', borderColor: crop.accentColor }]}
                      onPress={() => toggleCrop(crop.key)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name={crop.icon as any} size={16} color={isSelected ? crop.accentColor : AppTheme.textSecondary} />
                      <Text style={[styles.cropToggleText, isSelected && { color: crop.accentColor }]}>{crop.displayName}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Paywall Modal */}
      <Modal visible={paywallVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPaywallVisible(false)}>
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPaywallVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCancelText}>Fechar</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Escolha seu Plano</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBodyContent}>
            {/* Plan Cards */}
            {(['free', 'basico', 'pro'] as SubscriptionPlanType[]).map((planKey) => {
              const plan = getSubscriptionPlan(planKey);
              const isSelected = selectedPlan === planKey;
              const isPro = planKey === 'pro';
              return (
                <TouchableOpacity
                  key={planKey}
                  style={[styles.planCard, isSelected && styles.planCardActive, isPro && isSelected && styles.planCardPro]}
                  onPress={() => setSelectedPlan(planKey)}
                  activeOpacity={0.7}
                >
                  {isPro && (
                    <View style={styles.planPopular}>
                      <Text style={styles.planPopularText}>Mais Popular</Text>
                    </View>
                  )}
                  <View style={styles.planCardHeader}>
                    <MaterialCommunityIcons
                      name={planKey === 'free' ? 'leaf' : planKey === 'basico' ? 'star-outline' : 'crown'}
                      size={24}
                      color={isSelected ? (isPro ? AppTheme.warmAmber : AppTheme.accent) : AppTheme.textSecondary}
                    />
                    <View style={styles.planCardInfo}>
                      <Text style={[styles.planName, isSelected && styles.planNameActive]}>{plan.displayName}</Text>
                      <Text style={[styles.planPrice, isSelected && styles.planPriceActive]}>{plan.price}</Text>
                    </View>
                    <View style={[styles.planRadio, isSelected && styles.planRadioActive]}>
                      {isSelected && <View style={styles.planRadioDot} />}
                    </View>
                  </View>
                  <View style={styles.planFeatures}>
                    {plan.features.map((feat, i) => (
                      <View key={i} style={styles.planFeatureRow}>
                        <MaterialCommunityIcons name="check-circle" size={14} color={isSelected ? AppTheme.accent : AppTheme.textTertiary} />
                        <Text style={[styles.planFeatureText, isSelected && styles.planFeatureTextActive]}>{feat}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Subscribe Button */}
            {selectedPlan !== 'free' && (
              <TouchableOpacity
                style={styles.subscribeBtn}
                onPress={() => { Alert.alert('Assinatura', 'Funcionalidade em breve!'); setPaywallVisible(false); }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="rocket-launch-outline" size={18} color="#FFFFFF" />
                <Text style={styles.subscribeBtnText}>
                  Assinar {getSubscriptionPlan(selectedPlan).displayName}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={styles.paywallFooter}>
              Cancele a qualquer momento. Sem compromisso.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: AppTheme.text,
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  // Profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.text,
  },
  profileEmail: {
    fontSize: 13,
    color: AppTheme.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: AppTheme.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppTheme.accent,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: AppTheme.accent + '30',
  },
  editProfileBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.accent,
  },
  // Subscription
  subscriptionCard: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 16,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionPlan: {
    fontSize: 17,
    fontWeight: '600',
    color: AppTheme.text,
  },
  subscriptionPrice: {
    fontSize: 13,
    color: AppTheme.textSecondary,
    marginTop: 2,
  },
  subscriptionFeatures: {
    gap: 6,
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: AppTheme.text,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppTheme.accent,
    borderRadius: 12,
    paddingVertical: 12,
  },
  upgradeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Settings Rows
  card: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  settingsRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: AppTheme.accent + '12',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsRowContent: {
    flex: 1,
  },
  settingsRowTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: AppTheme.text,
  },
  settingsRowSubtitle: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    marginTop: 2,
  },
  // Sign Out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: AppTheme.coral + '12',
    borderRadius: 14,
    paddingVertical: 14,
  },
  signOutBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.coral,
  },
  // Modal shared
  modalContainer: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.border,
    backgroundColor: AppTheme.cardBackground,
  },
  modalCloseBtn: {
    width: 60,
  },
  modalCancelText: {
    fontSize: 15,
    color: AppTheme.textSecondary,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: AppTheme.text,
    textAlign: 'center',
  },
  modalSaveBtn: {
    width: 60,
    alignItems: 'flex-end',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.accent,
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 40,
  },
  // Form
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: AppTheme.text,
    borderWidth: 1,
    borderColor: AppTheme.border,
  },
  formPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppTheme.border,
  },
  formPickerText: {
    fontSize: 15,
    color: AppTheme.text,
  },
  pickerDropdown: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: AppTheme.border,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  pickerOptionActive: {
    backgroundColor: AppTheme.accent + '10',
  },
  pickerOptionText: {
    fontSize: 14,
    color: AppTheme.text,
  },
  pickerOptionTextActive: {
    color: AppTheme.accent,
    fontWeight: '600',
  },
  cropsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cropToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: AppTheme.cardBackground,
    borderWidth: 1,
    borderColor: AppTheme.border,
  },
  cropToggleText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppTheme.textSecondary,
  },
  // Paywall
  planCard: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardActive: {
    borderColor: AppTheme.accent,
  },
  planCardPro: {
    borderColor: AppTheme.warmAmber,
  },
  planPopular: {
    position: 'absolute',
    top: -1,
    right: 16,
    backgroundColor: AppTheme.warmAmber,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  planPopularText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  planCardInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 17,
    fontWeight: '600',
    color: AppTheme.textSecondary,
  },
  planNameActive: {
    color: AppTheme.text,
  },
  planPrice: {
    fontSize: 13,
    color: AppTheme.textTertiary,
    marginTop: 2,
  },
  planPriceActive: {
    color: AppTheme.textSecondary,
  },
  planRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: AppTheme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planRadioActive: {
    borderColor: AppTheme.accent,
  },
  planRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: AppTheme.accent,
  },
  planFeatures: {
    gap: 6,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planFeatureText: {
    fontSize: 13,
    color: AppTheme.textTertiary,
  },
  planFeatureTextActive: {
    color: AppTheme.text,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppTheme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  subscribeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  paywallFooter: {
    fontSize: 12,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
});
