/**
 * ForceUpdateModal — force mode (ported from Rumo Máquinas / Rumo Finance).
 *
 * Full-screen blocking modal. The user CANNOT dismiss this:
 *   - No `onRequestClose` prop on <Modal>, so swipe-back / sheet drag is dead.
 *   - Hardware back is intercepted by BackHandler returning true.
 *   - No X button, no "Later" button.
 *
 * On "Atualizar agora" we try the native deep link first
 * (itms-apps:// or market://), falling back to the https store URL. If both
 * fail we render an inline error message — we do NOT close the modal, because
 * the whole point is the user is blocked until they update. (Inline, never
 * Alert.alert: RN New Architecture renders native alerts BEHIND a full-screen
 * Modal — the silent no-op class of bug.)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';

import { BorderRadius, Colors, FontFamily, FontWeight, Spacing } from '../../constants/theme';
import { trackEvent } from '../../services/analytics';

import type { UpdateInfo } from '../../hooks/useAppUpdateCheck';
import { captureUpdateCheckIssue, isSafeStoreUrl } from '../../hooks/useAppUpdateCheck';

// Light on-brand green tint for the icon chip (chartSequential[0] tone).
const PRIMARY_TINT = '#E8EFE9';

interface ForceUpdateModalProps {
  updateInfo: UpdateInfo;
}

export function ForceUpdateModal({ updateInfo }: ForceUpdateModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const trackedBlockedRef = useRef(false);
  const [linkingError, setLinkingError] = useState(false);

  // Block hardware back on Android (no-op on iOS).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      subscription.remove();
    };
  }, []);

  // Track once per mount.
  useEffect(() => {
    if (trackedBlockedRef.current) return;
    trackedBlockedRef.current = true;
    try {
      trackEvent('update_force_blocked', {
        mode: 'force',
        current_version: Application.nativeApplicationVersion ?? 'unknown',
        latest_version: updateInfo.latestVersionName,
        platform: Platform.OS,
      });
    } catch {
      // analytics never breaks UI
    }
  }, [updateInfo.latestVersionName]);

  const handleUpdate = useCallback(async () => {
    setLinkingError(false);

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
        source: 'force-modal',
      });
      setLinkingError(true);
      return;
    }

    // Robust open chain: canOpenURL may throw on some Android OEMs / iOS sims
    // when the queried scheme isn't declared in LSApplicationQueriesSchemes.
    // Each step is wrapped so we always degrade to https fallback before
    // surfacing the inline error (modal stays open — user must update).
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
            mode: 'force',
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
            mode: 'force',
            url_type: 'fallback',
            current_version: Application.nativeApplicationVersion ?? 'unknown',
            latest_version: updateInfo.latestVersionName,
            platform: Platform.OS,
          });
        } catch {
          // analytics never breaks UI
        }
        return;
      } catch {
        // fall through to setLinkingError
      }
    }

    setLinkingError(true);
  }, [updateInfo.latestVersionName, updateInfo.storeUrlFallback, updateInfo.storeUrlNative]);

  if (Platform.OS === 'web') return null;

  const currentVersion = Application.nativeApplicationVersion ?? '';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Intentionally NO onRequestClose — Android back gesture must not close.
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: (insets?.top ?? 0) + Spacing.xl,
            paddingBottom: (insets?.bottom ?? 0) + Spacing.xl,
          },
        ]}
        testID="force-update-modal"
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.iconBox}>
            <Ionicons name="arrow-up-circle" size={64} color={Colors.accent} />
          </View>

          <Text style={styles.title}>{t('appUpdate.forceTitle')}</Text>
          <Text style={styles.subtitle}>{t('appUpdate.forceSubtitle')}</Text>

          {updateInfo.releaseNotes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>{t('appUpdate.releaseNotesTitle')}</Text>
              <Text style={styles.notesBody}>{updateInfo.releaseNotes}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('appUpdate.forceAction')}
            onPress={handleUpdate}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            testID="force-update-cta"
          >
            <Text style={styles.ctaText}>{t('appUpdate.forceAction')}</Text>
          </Pressable>

          {linkingError ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {t('appUpdate.noConnectionError')}
            </Text>
          ) : null}

          <Text style={styles.versionLabel}>
            {t('appUpdate.currentVersionLabel', { version: currentVersion })}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_TINT,
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    fontSize: 24,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  notesBox: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.separator,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  notesTitle: {
    fontFamily: FontFamily.bold,
    fontWeight: FontWeight.bold,
    fontSize: 17,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  notesBody: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  cta: {
    width: '100%',
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontFamily: FontFamily.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: 17,
    color: Colors.white,
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 12,
    color: Colors.coral,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  versionLabel: {
    fontFamily: FontFamily.regular,
    fontWeight: FontWeight.regular,
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
