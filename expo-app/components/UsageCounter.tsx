// -----------------------------------------------------------------------------
// UsageCounter — premium pill rendered on the camera entry screen.
// -----------------------------------------------------------------------------
// Shows the user's remaining diagnoses for the current calendar month and
// links to /paywall when they're close to (or past) the limit. We intentionally
// render NOTHING for the enterprise tier — the pill would only add noise when
// there's no limit to communicate.
//
// Variants:
//   • "default"  → leaf-green pill, plenty of headroom remaining (>=2 free
//                  diagnoses, or any non-zero remainder on Pro).
//   • "warning"  → amber pill when on free plan and only 1 diagnosis left.
//   • "blocked"  → coral pill when the limit is exhausted; tapping deep-links
//                  to /paywall so the user sees the upgrade options.
//
// Behaviour rules:
//   - The pill is never interactive when the plan is "pro" with headroom
//     remaining — there's no useful upsell there.
//   - The pill is always interactive when the plan is "free" so the user can
//     pre-emptively open /paywall to see what Pro offers.
//   - We render a skeleton placeholder while `loading` is true to avoid a
//     content-jump on the first cold-load of the camera screen.
// -----------------------------------------------------------------------------

import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';
import { useMonthlyUsage } from '../hooks/useMonthlyUsage';

type Variant = 'default' | 'warning' | 'blocked' | 'pro';

interface VariantStyle {
  bg: string;
  border: string;
  fg: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const VARIANT_STYLES: Record<Variant, VariantStyle> = {
  default: {
    bg: Colors.accent + '14',
    border: Colors.accent + '33',
    fg: Colors.accent,
    icon: 'leaf',
  },
  warning: {
    bg: Colors.warmAmber + '1A',
    border: Colors.warmAmber + '4D',
    fg: Colors.earthText,
    icon: 'flash',
  },
  blocked: {
    bg: Colors.coral + '1A',
    border: Colors.coral + '4D',
    fg: Colors.coral,
    icon: 'lock-closed',
  },
  pro: {
    bg: Colors.warmAmber + '14',
    border: Colors.warmAmber + '33',
    fg: Colors.earthText,
    icon: 'sparkles',
  },
};

export function UsageCounter() {
  const { t } = useTranslation();
  const { plan, used, limit, remaining, loading, error } = useMonthlyUsage();

  if (loading) {
    return (
      <View
        style={[styles.pill, styles.pillSkeleton]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('diagnosis.usageLoadingA11y')}
      >
        <ActivityIndicator size="small" color={Colors.systemGray3} />
      </View>
    );
  }

  // Don't render anything when both queries failed and we have no usable data —
  // a silent counter is better than a misleading one.
  if (error && used === 0) {
    return null;
  }

  // Enterprise (unlimited) → no pill. The home screen already shows total
  // diagnoses count; the camera entry doesn't need redundant chrome.
  if (limit === null) {
    return null;
  }

  let variant: Variant;
  if (plan === 'free' && remaining !== null && remaining <= 0) {
    variant = 'blocked';
  } else if (plan === 'free' && remaining !== null && remaining === 1) {
    variant = 'warning';
  } else if (plan === 'pro') {
    variant = 'pro';
  } else {
    variant = 'default';
  }

  const v = VARIANT_STYLES[variant];

  // Tap targets:
  //   - free + warning/blocked → /paywall (high-intent upgrade moment)
  //   - free + default         → /paywall (low-intent, exploratory)
  //   - pro                    → no-op (already upgraded, no useful action)
  const isInteractive = plan === 'free';

  const onPress = () => {
    if (!isInteractive) return;
    Haptics.selectionAsync();
    router.push('/paywall');
  };

  const label =
    variant === 'blocked'
      ? t('diagnosis.usageBlocked', { limit })
      : variant === 'pro'
        ? t('diagnosis.usagePro', { used, limit })
        : t('diagnosis.usageFree', { used, limit });

  const a11yLabel =
    variant === 'blocked'
      ? t('diagnosis.usageBlockedA11y', { limit })
      : t('diagnosis.usageRemainingA11y', { remaining: remaining ?? 0, limit });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={isInteractive ? 0.7 : 1}
      disabled={!isInteractive}
      style={[styles.pill, { backgroundColor: v.bg, borderColor: v.border }]}
      accessibilityLabel={a11yLabel}
      accessibilityRole={isInteractive ? 'button' : 'text'}
      accessibilityHint={isInteractive ? t('diagnosis.usageUpgradeHint') : undefined}
    >
      <Ionicons name={v.icon} size={14} color={v.fg} accessibilityElementsHidden />
      <Text style={[styles.label, { color: v.fg }]} numberOfLines={1}>
        {label}
      </Text>
      {/* Progress dots — only meaningful for the small free-plan limit (3) */}
      {plan === 'free' && limit !== null && limit <= 5 && (
        <View style={styles.dotsRow} accessibilityElementsHidden>
          {Array.from({ length: limit }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i < used ? v.fg : v.fg + '33',
                },
              ]}
            />
          ))}
        </View>
      )}
      {isInteractive && variant !== 'blocked' && (
        <Ionicons
          name="chevron-forward"
          size={12}
          color={v.fg + 'CC'}
          accessibilityElementsHidden
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
    maxWidth: '92%',
  },
  pillSkeleton: {
    backgroundColor: Colors.systemGray6,
    borderColor: Colors.systemGray5,
    minWidth: 140,
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.1,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
