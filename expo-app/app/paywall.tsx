import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PurchasesPackage } from 'react-native-purchases';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { Button, Card, Chip, Hero, IconButton } from '../components/ui';
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
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected(p.id);
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
