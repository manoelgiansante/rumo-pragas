/**
 * UpdateBanner — soft mode (ported from Rumo Máquinas / Rumo Finance).
 *
 * Sticky non-blocking banner pinned to the top safe-area inset. Slides in with
 * a spring on mount, slides out on dismiss. User can tap "Atualizar" (opens the
 * store) or "Depois" (persists dismiss for that build).
 *
 * Uses the built-in react-native `Animated` (useNativeDriver: true → transform
 * runs on the UI thread). Web is a no-op (the hook gates this too).
 *
 * Failure feedback is INLINE (never Alert.alert): on RN New Architecture a
 * native Alert can render BEHIND a full-screen Modal elsewhere in the tree —
 * the silent no-op class of bug this portfolio has hit 3×. The inline error
 * line below the banner text is always visible.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowUpCircle } from 'lucide-react-native';
import * as Application from 'expo-application';

import { BorderRadius, Colors, FontFamily, FontWeight, Spacing } from '../../constants/theme';
import { trackEvent } from '../../services/analytics';

import type { UpdateInfo } from '../../hooks/useAppUpdateCheck';
import { captureUpdateCheckIssue, isSafeStoreUrl } from '../../hooks/useAppUpdateCheck';

// Light on-brand green tint for the icon chip (chartSequential[0] tone).
const PRIMARY_TINT = '#E8EFE9';

interface UpdateBannerProps {
  updateInfo: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ updateInfo, onDismiss }: UpdateBannerProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const trackedShownRef = useRef(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const translateY = useRef(new Animated.Value(-60)).current;

  // Slide-in once on mount (native-driven spring).
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      damping: 18,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  // Track shown (one-shot per mount).
  useEffect(() => {
    if (trackedShownRef.current) return;
    trackedShownRef.current = true;
    try {
      trackEvent('update_banner_shown', {
        mode: 'soft',
        current_version: Application.nativeApplicationVersion ?? 'unknown',
        latest_version: updateInfo.latestVersionName,
        platform: Platform.OS,
      });
    } catch {
      // analytics never breaks UI
    }
  }, [updateInfo.latestVersionName]);

  const handleDismiss = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      trackEvent('update_dismissed', {
        mode: 'soft',
        current_version: Application.nativeApplicationVersion ?? 'unknown',
        latest_version: updateInfo.latestVersionName,
        platform: Platform.OS,
      });
    } catch {
      // ignore
    }
    Animated.timing(translateY, {
      toValue: -80,
      duration: 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start((result) => {
      if (result.finished) {
        onDismiss();
      }
    });
  }, [isLeaving, onDismiss, translateY, updateInfo.latestVersionName]);

  const handleUpdate = useCallback(async () => {
    setLinkError(false);

    const native = updateInfo.storeUrlNative;
    const fallback = updateInfo.storeUrlFallback;

    // Defense-in-depth: re-validate scheme allowlist at the call site. Hook
    // also sanitizes, but a stale snapshot or future code path that bypasses
    // the hook would otherwise hand attacker-controlled URLs to
    // Linking.openURL. Belt + suspenders.
    const nativeSafe = isSafeStoreUrl(native);
    const fallbackSafe = isSafeStoreUrl(fallback);
    if (!nativeSafe && !fallbackSafe) {
      captureUpdateCheckIssue('unsafe_store_url_blocked', {
        source: 'banner',
        nativePrefix: typeof native === 'string' ? native.slice(0, 24) : null,
        fallbackPrefix: typeof fallback === 'string' ? fallback.slice(0, 24) : null,
      });
      setLinkError(true);
      return;
    }

    // Robust open chain: canOpenURL may throw on some Android OEMs / iOS sims
    // when the queried scheme isn't declared in LSApplicationQueriesSchemes.
    // Each step is wrapped so we always degrade to https fallback before the
    // inline error.
    let canNative = false;
    if (nativeSafe) {
      try {
        canNative = await Linking.canOpenURL(native);
      } catch {
        // canOpenURL rejected — treat as not available, fall through to fallback.
      }
    }

    if (canNative) {
      try {
        await Linking.openURL(native);
        try {
          trackEvent('update_action_clicked', {
            mode: 'soft',
            url_type: 'native',
            current_version: Application.nativeApplicationVersion ?? 'unknown',
            latest_version: updateInfo.latestVersionName,
            platform: Platform.OS,
          });
        } catch {
          // analytics never breaks UI
        }
        return;
      } catch {
        // Native deeplink available but failed to open — fall through to fallback.
      }
    }

    if (fallbackSafe) {
      try {
        await Linking.openURL(fallback);
        try {
          trackEvent('update_action_clicked', {
            mode: 'soft',
            url_type: 'fallback',
            current_version: Application.nativeApplicationVersion ?? 'unknown',
            latest_version: updateInfo.latestVersionName,
            platform: Platform.OS,
          });
        } catch {
          // analytics never breaks UI
        }
        return;
      } catch (err) {
        // Both native AND fallback links died — capture to Sentry so support
        // has signal beyond the inline error.
        captureUpdateCheckIssue('update_banner_open_failed', {
          source: 'banner',
          native,
          fallback,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setLinkError(true);
  }, [updateInfo.latestVersionName, updateInfo.storeUrlFallback, updateInfo.storeUrlNative]);

  if (Platform.OS === 'web') return null;

  const topOffset = (insets?.top ?? 0) + 4;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, { top: topOffset }, { transform: [{ translateY }] }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="update-banner-soft"
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <ArrowUpCircle size={22} color={Colors.accent} />
          </View>

          <View style={styles.textBox}>
            <Text numberOfLines={1} style={styles.title}>
              {t('appUpdate.bannerTitle')}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {t('appUpdate.bannerSubtitle', { version: updateInfo.latestVersionName })}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('appUpdate.actionUpdate')}
            onPress={handleUpdate}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            testID="update-banner-cta"
          >
            <Text style={styles.ctaText}>{t('appUpdate.actionUpdate')}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('appUpdate.actionLater')}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            style={styles.dismiss}
            testID="update-banner-dismiss"
          >
            <Text style={styles.dismissText}>{t('appUpdate.actionLater')}</Text>
          </Pressable>
        </View>

        {linkError ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {t('appUpdate.noConnectionError')}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9998,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.separator,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    // shadow (lg)
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_TINT,
  },
  textBox: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    minHeight: 38,
    justifyContent: 'center',
    // shadow (sm)
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.white,
  },
  dismiss: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dismissText: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textTertiary,
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.coral,
    marginTop: Spacing.sm,
  },
});
