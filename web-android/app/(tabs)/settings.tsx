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
import { AppTheme } from '../../src/utils/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { SupabaseService } from '../../src/services/supabaseService';
import { UserProfile, SubscriptionPlanType } from '../../src/types';
import { getSubscriptionPlan } from '../../src/types/helpers';
import { CROPS } from '../../src/types/cropData';
import { roleDisplayName } from '../../src/utils/roleDisplayName';

/* ────────────────────────────────────────────────────────────────────────────
 * Constants
 * ──────────────────────────────────────────────────────────────────────────── */

const ROLES = ['produtor', 'agronomo', 'tecnico', 'consultor', 'estudante'];
const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

/* ────────────────────────────────────────────────────────────────────────────
 * Edit Profile Modal
 * ──────────────────────────────────────────────────────────────────────────── */

function EditProfileModal({
  visible,
  onClose,
  token,
  userId,
  initialName,
  initialRole,
  initialCity,
  initialState,
  initialCrops,
}: {
  visible: boolean;
  onClose: () => void;
  token: string | null;
  userId?: string;
  initialName: string;
  initialRole: string;
  initialCity: string;
  initialState: string;
  initialCrops: string[];
}) {
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [crops, setCrops] = useState<string[]>(initialCrops);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setRole(initialRole);
      setCity(initialCity);
      setState(initialState);
      setCrops(initialCrops);
      setError(null);
    }
  }, [visible]);

  const toggleCrop = (key: string) => {
    setCrops((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  };

  const save = async () => {
    if (!token || !userId) return;
    setIsSaving(true);
    setError(null);
    try {
      await SupabaseService.updateProfile(token, userId, {
        full_name: name,
        role,
        city,
        state,
        crops,
      });
      onClose();
    } catch {
      setError('Não foi possível salvar o perfil.');
    }
    setIsSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={ep.root}>
        <View style={ep.toolbar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={ep.cancelBtn}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={ep.toolTitle}>Editar Perfil</Text>
          <TouchableOpacity onPress={save} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={AppTheme.accent} />
            ) : (
              <Text style={ep.saveBtn}>Salvar</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Personal info */}
          <Text style={ep.sectionTitle}>Informações Pessoais</Text>
          <View style={ep.card}>
            <View style={ep.field}>
              <Text style={ep.label}>Nome</Text>
              <TextInput
                style={ep.input}
                value={name}
                onChangeText={setName}
                placeholder="Seu nome"
                placeholderTextColor={AppTheme.textTertiary}
                autoCapitalize="words"
              />
            </View>
            <View style={ep.divider} />
            <TouchableOpacity style={ep.field} onPress={() => setShowRolePicker(!showRolePicker)}>
              <Text style={ep.label}>Função</Text>
              <Text style={ep.pickerVal}>{roleDisplayName(role)}</Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={AppTheme.textTertiary} />
            </TouchableOpacity>
            {showRolePicker && (
              <View style={ep.pickerList}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={ep.pickerItem}
                    onPress={() => { setRole(r); setShowRolePicker(false); }}
                  >
                    <Text style={[ep.pickerText, role === r && { color: AppTheme.accent, fontWeight: '600' }]}>
                      {roleDisplayName(r)}
                    </Text>
                    {role === r && <MaterialCommunityIcons name="check" size={16} color={AppTheme.accent} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Location */}
          <Text style={ep.sectionTitle}>Localização</Text>
          <View style={ep.card}>
            <View style={ep.field}>
              <Text style={ep.label}>Cidade</Text>
              <TextInput
                style={ep.input}
                value={city}
                onChangeText={setCity}
                placeholder="Sua cidade"
                placeholderTextColor={AppTheme.textTertiary}
              />
            </View>
            <View style={ep.divider} />
            <TouchableOpacity style={ep.field} onPress={() => setShowStatePicker(!showStatePicker)}>
              <Text style={ep.label}>Estado</Text>
              <Text style={ep.pickerVal}>{state || 'Selecionar'}</Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color={AppTheme.textTertiary} />
            </TouchableOpacity>
            {showStatePicker && (
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                <View style={ep.pickerList}>
                  {BR_STATES.map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={ep.pickerItem}
                      onPress={() => { setState(st); setShowStatePicker(false); }}
                    >
                      <Text style={[ep.pickerText, state === st && { color: AppTheme.accent, fontWeight: '600' }]}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Crops */}
          <Text style={ep.sectionTitle}>Culturas</Text>
          <View style={ep.card}>
            {CROPS.map((c, i) => (
              <React.Fragment key={c.key}>
                {i > 0 && <View style={ep.divider} />}
                <View style={ep.cropRow}>
                  <MaterialCommunityIcons name={c.icon as any} size={18} color={c.accentColor} />
                  <Text style={ep.cropLabel}>{c.displayName}</Text>
                  <View style={{ flex: 1 }} />
                  <Switch
                    value={crops.includes(c.key)}
                    onValueChange={() => toggleCrop(c.key)}
                    trackColor={{ true: AppTheme.accent, false: AppTheme.border }}
                    thumbColor="#fff"
                  />
                </View>
              </React.Fragment>
            ))}
          </View>

          {error && <Text style={ep.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const ep = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppTheme.background },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: AppTheme.cardBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  toolTitle: { fontSize: 17, fontWeight: '600', color: AppTheme.text },
  cancelBtn: { fontSize: 16, color: AppTheme.textSecondary },
  saveBtn: { fontSize: 16, fontWeight: '600', color: AppTheme.techBlue },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppTheme.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: AppTheme.cardBackground,
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  label: { fontSize: 15, color: AppTheme.text, width: 80 },
  input: { flex: 1, fontSize: 15, color: AppTheme.text, textAlign: 'right' },
  pickerVal: { flex: 1, fontSize: 15, color: AppTheme.textSecondary, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: AppTheme.border, marginLeft: 16 },
  pickerList: { paddingBottom: 8 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    gap: 8,
  },
  pickerText: { fontSize: 15, color: AppTheme.text, flex: 1 },
  cropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  cropLabel: { fontSize: 15, color: AppTheme.text },
  error: { fontSize: 13, color: AppTheme.coral, textAlign: 'center', marginTop: 16 },
});

/* ────────────────────────────────────────────────────────────────────────────
 * Paywall Modal
 * ──────────────────────────────────────────────────────────────────────────── */

function PaywallModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>('pro');
  const plans: SubscriptionPlanType[] = ['free', 'basico', 'pro'];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={pw.root}>
        <View style={pw.toolbar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={pw.closeBtn}>Fechar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20, paddingBottom: 40 }}>
          {/* Header */}
          <View style={pw.headerWrap}>
            <View style={pw.crownGlow}>
              <View style={pw.crownCircle}>
                <MaterialCommunityIcons name="crown" size={30} color="#fff" />
              </View>
            </View>
            <Text style={pw.headerTitle}>Rumo Pragas Pro</Text>
            <Text style={pw.headerSub}>
              {'Desbloqueie todo o potencial da IA\npara proteger sua lavoura'}
            </Text>
          </View>

          {/* Plan cards */}
          <View style={pw.plansRow}>
            {plans.map((key) => {
              const plan = getSubscriptionPlan(key);
              const selected = selectedPlan === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[pw.planCard, selected && pw.planCardSel]}
                  onPress={() => setSelectedPlan(key)}
                  activeOpacity={0.7}
                >
                  {key === 'pro' && (
                    <View style={pw.popularBadge}>
                      <MaterialCommunityIcons name="star" size={8} color="#fff" />
                      <Text style={pw.popularText}>Popular</Text>
                    </View>
                  )}
                  <Text style={[pw.planName, selected && { color: '#fff' }]}>{plan.displayName}</Text>
                  <Text style={[pw.planPrice, selected && { color: 'rgba(255,255,255,0.9)' }]}>{plan.price}</Text>
                  <Text style={[pw.planLimit, selected && { color: 'rgba(255,255,255,0.7)' }]}>
                    {plan.diagnosisLimit} diag/mês
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Features */}
          <View style={pw.featCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MaterialCommunityIcons name="check-decagram" size={18} color={AppTheme.accent} />
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: AppTheme.text }}>Recursos incluídos</Text>
            </View>
            {getSubscriptionPlan(selectedPlan).features.map((f, i) => (
              <View key={i} style={pw.featRow}>
                <View style={pw.featCheck}>
                  <MaterialCommunityIcons name="check" size={10} color={AppTheme.accent} />
                </View>
                <Text style={pw.featText}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Subscribe */}
          <TouchableOpacity style={pw.subBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={pw.subBtnText}>
              {selectedPlan === 'free' ? 'Continuar Gratuito' : `Assinar ${getSubscriptionPlan(selectedPlan).displayName}`}
            </Text>
          </TouchableOpacity>
          <Text style={pw.disclaimer}>Cancele a qualquer momento. Sem compromisso.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const pw = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppTheme.background },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: AppTheme.cardBackground,
  },
  closeBtn: { fontSize: 16, color: AppTheme.textSecondary },
  headerWrap: { alignItems: 'center', paddingVertical: 24 },
  crownGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: AppTheme.warmAmber + '2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  crownCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: AppTheme.warmAmber,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppTheme.warmAmber,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: AppTheme.text },
  headerSub: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
  plansRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  planCard: {
    flex: 1,
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.border,
  },
  planCardSel: {
    backgroundColor: AppTheme.accent,
    borderColor: AppTheme.accent,
    borderWidth: 2,
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.warmAmber,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    marginBottom: 8,
  },
  popularText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  planName: { fontSize: 14, fontWeight: 'bold', color: AppTheme.text, marginBottom: 4 },
  planPrice: { fontSize: 12, fontWeight: 'bold', color: AppTheme.textSecondary },
  planLimit: { fontSize: 10, color: AppTheme.textTertiary, marginTop: 4 },
  featCard: {
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  featRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  featCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AppTheme.accent + '1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featText: { fontSize: 14, color: AppTheme.text },
  subBtn: {
    backgroundColor: AppTheme.accent,
    borderRadius: 14,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  subBtnText: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  disclaimer: { fontSize: 11, color: AppTheme.textTertiary, textAlign: 'center', marginTop: 14 },
});

/* ────────────────────────────────────────────────────────────────────────────
 * Settings Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function SettingsScreen() {
  const { currentUser, accessToken, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguage] = useState('pt');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [currentPlan] = useState<SubscriptionPlanType>('free');
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!accessToken || !currentUser?.id) {
      setLoading(false);
      return;
    }
    try {
      const p = await SupabaseService.fetchProfile(accessToken, currentUser.id);
      if (p) {
        setProfile(p as UserProfile);
        setIsDarkMode(p.dark_mode ?? false);
        setPushEnabled(p.push_enabled ?? true);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [accessToken, currentUser?.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const userName = profile?.full_name || currentUser?.user_metadata?.full_name || 'Produtor';
  const userEmail = currentUser?.email || '';
  const userRole = profile?.role || 'produtor';
  const initial = (userName || 'P').charAt(0).toUpperCase();
  const planInfo = getSubscriptionPlan(currentPlan);

  const handleSignOut = () => {
    Alert.alert('Tem certeza que deseja sair?', '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const toggleDarkMode = async (val: boolean) => {
    setIsDarkMode(val);
    if (accessToken && currentUser?.id) {
      try { await SupabaseService.updateProfile(accessToken, currentUser.id, { dark_mode: val }); } catch {}
    }
  };

  const togglePush = async (val: boolean) => {
    setPushEnabled(val);
    if (accessToken && currentUser?.id) {
      try { await SupabaseService.updateProfile(accessToken, currentUser.id, { push_enabled: val }); } catch {}
    }
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={AppTheme.accent} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Configurações</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Profile Section ── */}
        <Text style={s.sectionLabel}>PERFIL</Text>
        <View style={s.card}>
          <View style={s.profileRow}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{userName}</Text>
              <Text style={s.profileEmail}>{userEmail}</Text>
              <View style={s.roleBadge}>
                <MaterialCommunityIcons name="shield-check" size={10} color={AppTheme.accent} />
                <Text style={s.roleText}>{roleDisplayName(userRole)}</Text>
              </View>
            </View>
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => setShowEditProfile(true)}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={AppTheme.techBlue} />
            <Text style={[s.rowText, { color: AppTheme.techBlue }]}>Editar Perfil</Text>
          </TouchableOpacity>
        </View>

        {/* ── Subscription Section ── */}
        <Text style={s.sectionLabel}>ASSINATURA</Text>
        <View style={s.card}>
          <View style={s.subRow}>
            <View style={s.crownBox}>
              <MaterialCommunityIcons name="crown" size={16} color={AppTheme.warmAmber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.subTitle}>Plano Atual</Text>
              <Text style={s.subPlan}>{planInfo.displayName}</Text>
            </View>
            <Text style={s.subPrice}>{planInfo.price}</Text>
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} onPress={() => setShowPaywall(true)}>
            <MaterialCommunityIcons name="arrow-up-circle" size={18} color={AppTheme.techBlue} />
            <Text style={[s.rowText, { color: AppTheme.techBlue, flex: 1 }]}>Upgrade de Plano</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={AppTheme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Appearance & Preferences ── */}
        <Text style={s.sectionLabel}>APARÊNCIA E PREFERÊNCIAS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <MaterialCommunityIcons name="weather-night" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Modo Escuro</Text>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ true: AppTheme.accent, false: AppTheme.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <MaterialCommunityIcons name="earth" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Idioma</Text>
            <TouchableOpacity onPress={() => setLanguage(language === 'pt' ? 'es' : 'pt')}>
              <Text style={{ fontSize: 14, color: AppTheme.textSecondary }}>
                {language === 'pt' ? 'Português' : 'Español'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <MaterialCommunityIcons name="bell-badge" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Notificações Push</Text>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ true: AppTheme.accent, false: AppTheme.border }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── About ── */}
        <Text style={s.sectionLabel}>SOBRE</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => Linking.openURL('https://rumopragas.com.br/privacidade')}
          >
            <MaterialCommunityIcons name="hand-back-left" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Política de Privacidade</Text>
            <MaterialCommunityIcons name="open-in-new" size={12} color={AppTheme.textTertiary} />
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.row}
            onPress={() => Linking.openURL('https://rumopragas.com.br/termos')}
          >
            <MaterialCommunityIcons name="file-document" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Termos de Uso</Text>
            <MaterialCommunityIcons name="open-in-new" size={12} color={AppTheme.textTertiary} />
          </TouchableOpacity>
          <View style={s.divider} />
          <View style={s.row}>
            <MaterialCommunityIcons name="information" size={18} color={AppTheme.text} />
            <Text style={[s.rowText, { flex: 1 }]}>Versão</Text>
            <Text style={{ fontSize: 14, color: AppTheme.textSecondary, fontVariant: ['tabular-nums'] }}>1.0.0</Text>
          </View>
        </View>

        {/* ── Sign out ── */}
        <View style={[s.card, { marginTop: 24, marginHorizontal: 16 }]}>
          <TouchableOpacity style={[s.row, { justifyContent: 'center' }]} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={18} color={AppTheme.coral} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: AppTheme.coral }}>Sair da Conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modals */}
      <EditProfileModal
        visible={showEditProfile}
        onClose={() => { setShowEditProfile(false); loadProfile(); }}
        token={accessToken}
        userId={currentUser?.id}
        initialName={userName}
        initialRole={userRole}
        initialCity={profile?.city || ''}
        initialState={profile?.state || ''}
        initialCrops={profile?.crops || []}
      />
      <PaywallModal visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppTheme.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
    backgroundColor: AppTheme.cardBackground,
  },
  title: { fontSize: 28, fontWeight: 'bold', color: AppTheme.text },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AppTheme.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: AppTheme.cardBackground,
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: AppTheme.border, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  rowText: { fontSize: 15, color: AppTheme.text },

  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarText: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  profileName: { fontSize: 16, fontWeight: '600', color: AppTheme.text },
  profileEmail: { fontSize: 12, color: AppTheme.textSecondary, marginTop: 2 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  roleText: { fontSize: 10, fontWeight: '600', color: AppTheme.accent },

  // Subscription
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  crownBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: AppTheme.warmAmber + '26',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subTitle: { fontSize: 14, color: AppTheme.text },
  subPlan: { fontSize: 12, fontWeight: 'bold', color: AppTheme.accent, marginTop: 2 },
  subPrice: { fontSize: 14, fontWeight: '600', color: AppTheme.textSecondary },
});
