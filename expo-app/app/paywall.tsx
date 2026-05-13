import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { Button, Card, Chip, Hero, IconButton } from '../components/ui';
import {
  isRevenueCatConfigured,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from '../services/purchases';
import { PAYWALL_LITE_MODE, isApprovedIapId } from '../constants/iap';
import { trackEvent } from '../services/analytics';

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

  // Analytics: paywall viewed (mount, fire-and-forget)
  useEffect(() => {
    trackEvent('paywall_viewed', { source: 'unknown' });
  }, []);

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

  // Fetch RevenueCat offerings on mount.
  // PAYWALL LITE MODE: filter packages down to approved-only IAP ids on the
  // FIRST submission. See constants/iap.ts.
  useEffect(() => {
    if (!configured) return;
    getOfferings().then((rawPkgs) => {
      const pkgs = PAYWALL_LITE_MODE
        ? rawPkgs.filter((pkg) => isApprovedIapId(pkg.product?.identifier))
        : rawPkgs;
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
  const plansWithPricesAll = useMemo(
    () => PLANS.map((p) => (realPrices[p.id] ? { ...p, price: realPrices[p.id] } : p)),
    [PLANS, realPrices],
  );

  // PAYWALL LITE MODE: hide plan cards that have no purchasable IAP backing them.
  // 'free' is always kept so users always have an exit. After RC packages load,
  // only plans whose `findPackageForPlan` resolves to an approved IAP are shown.
  const plansWithPrices = useMemo(() => {
    if (!PAYWALL_LITE_MODE) return plansWithPricesAll;
    if (!configured) return plansWithPricesAll;
    if (packages.length === 0) {
      // Offerings not loaded yet — keep all visible to avoid empty flash.
      return plansWithPricesAll;
    }
    const purchasablePlanIds = new Set<string>();
    packages.forEach((pkg) => {
      const id = mapPackageToPlan(pkg);
      if (id) purchasablePlanIds.add(id);
    });
    return plansWithPricesAll.filter((p) => p.id === 'free' || purchasablePlanIds.has(p.id));
  }, [plansWithPricesAll, configured, packages]);

  // Keep `selected` in sync with the visible plan list — if the previously
  // selected plan got hidden by lite mode, fall back to the first visible one.
  useEffect(() => {
    if (!plansWithPrices.find((p) => p.id === selected)) {
      const fallback = plansWithPrices[0]?.id;
      if (fallback) setSelected(fallback);
    }
  }, [plansWithPrices, selected]);

  const plan = plansWithPrices.find((p) => p.id === selected) ?? plansWithPrices[0];

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
    trackEvent('paywall_purchase_started', { plan_id: selected });
    try {
      const customerInfo = await purchasePackage(pkg);
      if (customerInfo) {
        // Purchase succeeded
        trackEvent('paywall_purchase_success', { plan_id: selected, provider: Platform.OS });
        Alert.alert(t('paywall.subscriptionActivated'), t('paywall.enjoyFeatures'), [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
      // customerInfo === null means user cancelled -- do nothing
    } catch (e: unknown) {
      // Apple iPad reviewer hardening (2026-05-07): never surface raw
      // RevenueCat English (e.g. "There was a problem with the App Store")
      // — reviewer counts that as Guideline 2.1(a) "error message". Map all
      // failure paths to the localized purchaseErrorMsg.
      const code = (e as { userCancelled?: boolean; code?: string } | null)?.code;
      const userCancelled = (e as { userCancelled?: boolean } | null)?.userCancelled;
      if (userCancelled || code === 'PURCHASE_CANCELLED') {
        // user backed out — silent, no error toast
        trackEvent('paywall_purchase_failed', { plan_id: selected, error_code: 'user_cancelled' });
      } else {
        trackEvent('paywall_purchase_failed', {
          plan_id: selected,
          error_code: code ?? 'unknown',
        });
        Alert.alert(t('paywall.purchaseError'), t('paywall.purchaseErrorMsg'));
      }
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

  // Defensive guard: if NO plans are visible (lite-mode misconfig OR offerings
  // empty), render a friendly empty state instead of a blank screen.
  if (plansWithPrices.length === 0 || !plan) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View
          style={[
            styles.scrollContent,
            { padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', flex: 1 },
          ]}
        >
          <Ionicons name="hourglass-outline" size={48} color={Colors.textSecondary} />
          <Text style={[styles.featuresTitle, { textAlign: 'center', marginTop: Spacing.lg }]}>
            {t('paywall.comingSoonTitle')}
          </Text>
          <Text style={[styles.cancelNote, { marginTop: Spacing.sm }]}>
            {t('paywall.comingSoonMsg')}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.restoreBtn, { marginTop: Spacing.lg }]}
          >
            <Text style={styles.restoreText}>{t('paywall.closeA11y')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero — covers ~45% of viewport with leaf-gradient */}
        <Hero topInset={28} style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={{ width: 40 }} />
            <IconButton
              iconName="close"
              tone="onHero"
              size={22}
              accessibilityLabel={t('paywall.closeA11y')}
              onPress={() => router.back()}
              testID="paywall.close"
            />
          </View>

          <View style={styles.heroBody}>
            <View style={styles.heroIconCircle}>
              <Ionicons name="sparkles" size={28} color={Colors.white} />
            </View>
            <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>
              RUMO PRAGAS PRO
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {t('paywall.title')}
            </Text>
            <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>
          </View>
        </Hero>

        {/* White sheet — features + plan cards lift off hero */}
        <View style={styles.sheet}>
          <View style={styles.featuresBlock}>
            <Text style={styles.featuresTitle} accessibilityRole="header">
              {t('paywall.featuresIncluded')}
            </Text>
            {plan.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureLabel}>{f}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Plan cards stacked */}
          <View style={styles.plansBlock}>
            {plansWithPrices.map((p) => {
              const isSelected = selected === p.id;
              // testID per plan id — mapped from RC product mapping so Maestro
              // can target both monthly/annual when both are visible.
              const testID =
                p.id === 'pro'
                  ? 'paywall.plan-monthly'
                  : p.id === 'enterprise'
                    ? 'paywall.plan-annual'
                    : `paywall.plan-${p.id}`;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected(p.id);
                    trackEvent('paywall_plan_selected', { plan_id: p.id });
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel={t('paywall.planA11y', {
                    name: p.name,
                    price: p.price,
                    limit:
                      p.limit === -1
                        ? t('paywall.unlimitedDiagnoses')
                        : t('paywall.limitedDiagnoses', { count: p.limit }),
                  })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  testID={testID}
                >
                  <Card
                    padding={Spacing.lg}
                    style={[styles.planCard, isSelected && styles.planCardSelected]}
                  >
                    {p.popular && (
                      <View style={styles.popularBadgeWrap}>
                        <Chip iconName="star">{t('paywall.popular')}</Chip>
                      </View>
                    )}
                    <View style={styles.planRow}>
                      <Text style={[styles.planName, isSelected && styles.planNameSelected]}>
                        {p.name}
                      </Text>
                      <View style={styles.priceRow}>
                        <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                          {p.price}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.planLimit}>
                      {p.limit === -1
                        ? t('paywall.unlimited')
                        : `${p.limit} ${t('paywall.diagPerMonth')}`}
                    </Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CTA */}
          <Button
            variant="primary"
            size="lg"
            block
            loading={purchasing}
            onPress={handleSubscribe}
            accessibilityLabel={
              selected === 'free'
                ? t('paywall.continueFreePlanA11y')
                : t('paywall.subscribePlanA11y', { name: plan.name, price: plan.price })
            }
            style={styles.subscribeBtn}
            testID="paywall.subscribe"
          >
            {selected === 'free'
              ? t('paywall.continueFree')
              : `${t('paywall.subscribe')} ${plan.price}`}
          </Button>

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
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID="paywall.restore"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Text style={styles.restoreText}>{t('paywall.restorePurchases')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: {
    paddingBottom: 32,
  },
  hero: {
    paddingBottom: 40,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBody: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.bold,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: -0.56,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: FontSize.subheadline,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 22,
  },
  sheet: {
    backgroundColor: Colors.background,
    marginTop: -16,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  featuresBlock: {
    marginBottom: Spacing.xxl,
  },
  featuresTitle: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: Spacing.md,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureLabel: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    lineHeight: 22,
  },
  plansBlock: {
    gap: 12,
    marginBottom: Spacing.xxl,
  },
  planCard: {
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '0D',
  },
  popularBadgeWrap: {
    position: 'absolute',
    top: -12,
    right: 16,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.sm,
  },
  planName: {
    fontSize: FontSize.headline,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  planNameSelected: {
    color: Colors.accent,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  planPrice: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  planPriceSelected: {
    color: Colors.accent,
  },
  planLimit: {
    fontSize: FontSize.footnote,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  subscribeBtn: {
    marginTop: 4,
  },
  cancelNote: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  restoreBtn: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: FontSize.footnote,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  legalDisclosure: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
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
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
  },
});
