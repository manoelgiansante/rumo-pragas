import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

  const PLANS = useMemo(
    () => [
      {
        id: 'free',
        name: t('paywall.plans.free'),
        price: t('paywall.plans.freePrice'),
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
        price: t('paywall.plans.proPrice'),
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
        price: t('paywall.plans.enterprisePrice'),
        limit: -1,
        features: [
          t('paywall.plans.unlimitedDiag'),
          t('paywall.plans.allPro'),
          t('paywall.plans.apiIntegration'),
          t('paywall.plans.advancedDashboard'),
          t('paywall.plans.dedicatedSupport'),
        ],
      },
    ],
    [t],
  );

  const [selected, setSelected] = useState('pro');
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  // Store real prices from RevenueCat
  const [realPrices, setRealPrices] = useState<Record<string, string>>({});

  // Fetch RevenueCat offerings on mount
  useEffect(() => {
    if (!configured) return;
    getOfferings().then((pkgs) => {
      setPackages(pkgs);
      // Collect real store prices (without mutating PLANS)
      const prices: Record<string, string> = {};
      pkgs.forEach((pkg) => {
        const planId = mapPackageToPlan(pkg);
        if (planId) {
          prices[planId] = pkg.product.priceString;
        }
      });
      setRealPrices(prices);
    });
  }, [configured]);

  // Merge real prices with plan definitions (immutable)
  const plansWithPrices = useMemo(
    () => PLANS.map((p) => (realPrices[p.id] ? { ...p, price: realPrices[p.id] } : p)),
    [PLANS, realPrices],
  );

  const plan = plansWithPrices.find((p) => p.id === selected)!;

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('paywall.purchaseErrorMsg');
      Alert.alert(t('paywall.purchaseError'), message);
    } finally {
      setPurchasing(false);
    }
  }, [selected, configured, findPackageForPlan, t]);

  const handleRestore = useCallback(async () => {
    // If RC is not configured (missing key), surface a graceful error instead
    // of crashing — keeps the Restore button always tappable for reviewers.
    if (!configured) {
      Alert.alert(t('common.error'), t('paywall.restoreError'));
      return;
    }
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
  }, [t, configured]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <LinearGradient colors={Gradients.hero} style={styles.header}>
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
          {plansWithPrices.map((p) => (
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
                  <Text style={styles.popularText} maxFontSizeMultiplier={1.2}>
                    {t('paywall.popular')}
                  </Text>
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
            colors={selected === 'free' ? [Colors.systemGray4, Colors.systemGray3] : Gradients.hero}
            style={styles.subscribeBtn}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.subscribeBtnText} maxFontSizeMultiplier={1.2}>
                {selected === 'free'
                  ? t('paywall.continueFree')
                  : `${t('paywall.subscribe')} ${plan.price}`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.cancelNote}>{t('paywall.cancelNote')}</Text>

        {/* Apple Schedule 2 / Guideline 3.1.2: auto-renew disclosure REQUIRED for
            auto-renewable subscriptions. Must appear adjacent to subscribe CTA. */}
        {selected !== 'free' && (
          <Text style={styles.legalDisclosure}>{t('paywall.legalDisclosure')}</Text>
        )}

        {/* Apple Guideline 3.1.2 / 5.1.1: link to Privacy + Terms (EULA) on paywall. */}
        <View
          style={styles.legalLinks}
          accessibilityLabel={t('paywall.legalLinksA11y')}
          accessibilityRole="none"
        >
          <TouchableOpacity
            onPress={() => router.push('/privacy')}
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.legalLinkText}>{t('paywall.legalPrivacy')}</Text>
          </TouchableOpacity>
          <Text style={styles.legalLinkSeparator}>·</Text>
          <TouchableOpacity
            onPress={() => router.push('/terms')}
            accessibilityRole="link"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.legalLinkText}>{t('paywall.legalTerms')}</Text>
          </TouchableOpacity>
        </View>

        {/* Apple Guideline 3.1.1: Restore Purchases must ALWAYS be visible to
            users on the paywall, regardless of RC config state. If RC isn't
            configured we still render the button and surface a graceful error. */}
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
  legalDisclosure: {
    fontSize: FontSize.caption2,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  legalLinkText: {
    fontSize: FontSize.caption,
    color: Colors.accent,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
  },
});
