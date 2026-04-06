import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PurchasesPackage } from 'react-native-purchases';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../constants/theme';
import {
  isRevenueCatConfigured,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from '../services/purchases';

export default function PaywallScreen() {
  const { t } = useTranslation();

  const PLANS = [
    {
      id: 'free',
      name: t('paywall.plans.free'),
      price: 'R$ 0',
      limit: 3,
      features: [
        t('paywall.plans.freeDiag'),
        t('paywall.plans.pestLibrary'),
        t('paywall.plans.limitedChat'),
      ],
    },
    {
      id: 'pro',
      name: t('paywall.plans.pro'),
      price: 'R$ 29/mes',
      limit: 30,
      popular: true,
      features: [
        t('paywall.plans.proDiag'),
        t('paywall.plans.fullLibrary'),
        t('paywall.plans.unlimitedChat'),
        t('paywall.plans.fullHistory'),
        t('paywall.plans.prioritySupport'),
      ],
    },
    {
      id: 'enterprise',
      name: t('paywall.plans.enterprise'),
      price: 'R$ 69/mes',
      limit: -1,
      features: [
        t('paywall.plans.unlimitedDiag'),
        t('paywall.plans.allPro'),
        t('paywall.plans.apiIntegration'),
        t('paywall.plans.advancedDashboard'),
        t('paywall.plans.dedicatedSupport'),
      ],
    },
  ];

  const [selected, setSelected] = useState('pro');
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const plan = PLANS.find((p) => p.id === selected)!;
  const configured = isRevenueCatConfigured();

  /**
   * Try to match a RevenueCat package to one of our local plan ids.
   */
  function mapPackageToPlan(pkg: PurchasesPackage): string | null {
    const id = pkg.identifier.toLowerCase();
    if (id.includes('enterprise')) return 'enterprise';
    if (id.includes('pro') || id === '$rc_monthly' || id === '$rc_annual') return 'pro';
    return null;
  }

  // Fetch RevenueCat offerings on mount
  useEffect(() => {
    if (!configured) return;
    getOfferings().then((pkgs) => {
      setPackages(pkgs);
      // Override local prices with real store prices when available
      pkgs.forEach((pkg) => {
        const planId = mapPackageToPlan(pkg);
        const match = PLANS.find((p) => p.id === planId);
        if (match) {
          match.price = pkg.product.priceString;
        }
      });
    });
  }, [configured]);

  const findPackageForPlan = useCallback(
    (planId: string): PurchasesPackage | undefined => {
      return packages.find((pkg) => mapPackageToPlan(pkg) === planId);
    },
    [packages],
  );

  const handleSubscribe = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selected === 'free') {
      router.back();
      return;
    }

    // If RevenueCat is not configured, show "coming soon" fallback
    if (!configured) {
      Alert.alert(t('paywall.comingSoonTitle'), t('paywall.comingSoonMsg'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }

    const pkg = findPackageForPlan(selected);
    if (!pkg) {
      Alert.alert(t('paywall.planUnavailableTitle'), t('paywall.planUnavailableMsg'));
      return;
    }

    setPurchasing(true);
    try {
      const customerInfo = await purchasePackage(pkg);
      if (customerInfo) {
        // Purchase succeeded
        Alert.alert(t('paywall.subscriptionActivated'), t('paywall.enjoyFeatures'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
      // customerInfo === null means user cancelled -- do nothing
    } catch (e: any) {
      Alert.alert(t('paywall.purchaseError'), e?.message || t('paywall.purchaseErrorMsg'));
    } finally {
      setPurchasing(false);
    }
  }, [selected, configured, findPackageForPlan]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      if (customerInfo) {
        const hasActive =
          customerInfo.entitlements.active['pro'] || customerInfo.entitlements.active['enterprise'];
        if (hasActive) {
          Alert.alert(t('paywall.purchasesRestored'), t('paywall.subscriptionReactivated'), [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } else {
          Alert.alert(t('paywall.noSubscriptionFound'), t('paywall.noSubscriptionFoundMsg'));
        }
      } else {
        Alert.alert(t('common.error'), t('paywall.restoreError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('paywall.restoreError'));
    } finally {
      setRestoring(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <LinearGradient colors={Gradients.hero as any} style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeBtn}
            accessibilityLabel={t('paywall.closeA11y')}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <Ionicons name="diamond" size={40} color="#FFF" style={{ marginBottom: 12 }} />
          <Text style={styles.title}>{t('paywall.title')}</Text>
          <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>
        </LinearGradient>

        <View style={styles.plans}>
          {PLANS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.planCard, selected === p.id && styles.planCardSelected]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(p.id);
              }}
              activeOpacity={0.8}
              accessibilityLabel={t('paywall.planA11y', {
                name: p.name,
                price: p.price,
                limit:
                  p.limit === -1
                    ? t('paywall.unlimitedDiagnoses')
                    : t('paywall.limitedDiagnoses', { count: p.limit }),
              })}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === p.id }}
            >
              {p.popular && (
                <View style={styles.popularBadge}>
                  <Ionicons name="star" size={8} color="#FFF" />
                  <Text style={styles.popularText}>{t('paywall.popular')}</Text>
                </View>
              )}
              <Text style={[styles.planName, selected === p.id && styles.planNameSelected]}>
                {p.name}
              </Text>
              <Text style={[styles.planPrice, selected === p.id && styles.planPriceSelected]}>
                {p.price}
              </Text>
              <Text style={styles.planLimit}>
                {p.limit === -1
                  ? t('paywall.unlimited')
                  : `${p.limit} ${t('paywall.diagPerMonth')}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>{t('paywall.featuresIncluded')}</Text>
          {plan.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleSubscribe}
          activeOpacity={0.8}
          disabled={purchasing}
          accessibilityLabel={
            selected === 'free'
              ? t('paywall.continueFreePlanA11y')
              : t('paywall.subscribePlanA11y', { name: plan.name, price: plan.price })
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: purchasing, busy: purchasing }}
        >
          <LinearGradient
            colors={
              selected === 'free'
                ? [Colors.systemGray4, Colors.systemGray3]
                : (Gradients.hero as any)
            }
            style={styles.subscribeBtn}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.subscribeBtnText}>
                {selected === 'free'
                  ? t('paywall.continueFree')
                  : `${t('paywall.subscribe')} ${plan.price}`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.cancelNote}>{t('paywall.cancelNote')}</Text>

        {configured && (
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            style={styles.restoreBtn}
            accessibilityLabel={t('paywall.restoreA11y')}
            accessibilityRole="button"
            accessibilityState={{ disabled: restoring, busy: restoring }}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Text style={styles.restoreText}>{t('paywall.restorePurchases')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: FontSize.title, fontWeight: '700', color: '#FFF' },
  subtitle: {
    fontSize: FontSize.subheadline,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 8,
  },
  plans: { flexDirection: 'row', gap: 10, padding: Spacing.lg },
  planCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '0D' },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    position: 'absolute',
    top: -10,
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  popularText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  planName: { fontSize: FontSize.subheadline, fontWeight: '700', color: Colors.textSecondary },
  planNameSelected: { color: Colors.accent },
  planPrice: { fontSize: FontSize.title3, fontWeight: '700', marginTop: 4 },
  planPriceSelected: { color: Colors.accent },
  planLimit: { fontSize: FontSize.caption2, color: Colors.textSecondary, marginTop: 4 },
  features: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  featuresTitle: { fontSize: FontSize.subheadline, fontWeight: '700', marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  featureText: { fontSize: FontSize.subheadline },
  footer: { padding: Spacing.lg, paddingBottom: 32 },
  subscribeBtn: {
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscribeBtnText: { fontSize: FontSize.headline, fontWeight: '700', color: '#FFF' },
  cancelNote: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  restoreBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  restoreText: { fontSize: FontSize.subheadline, color: Colors.accent, fontWeight: '600' },
});
