import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, BookOpen, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';
import { useNavigationGate } from '../contexts/NavigationGateContext';
import { trackEvent } from '../services/analytics';

interface OnboardingPage {
  id: string;
  titleKey: string;
  subtitleKey: string;
  gradientColors: [string, string];
  Icon: typeof Camera;
}

// QW-2 (W16-1, 2026-05-22): reduced 4 -> 3 pages by removing the secondary
// "Histórico Completo" feature page (was page2). Each extra onboarding screen
// historically drops conversion 5-8%; the History feature is discoverable
// in-app via the dedicated tab and doesn't need a dedicated onboarding pitch.
// Page1 = primary value prop (AI diagnose), page3->2 = library, page4->3 = MIP/CTA.
// Sequential green/amber ramp — no rainbow, no tech-blue (per design system token doc).
const PAGES: OnboardingPage[] = [
  {
    id: '1',
    titleKey: 'onboarding.page1Title',
    subtitleKey: 'onboarding.page1Subtitle',
    gradientColors: ['#06281D', '#0F6B4D'],
    Icon: Camera,
  },
  {
    id: '2',
    titleKey: 'onboarding.page3Title',
    subtitleKey: 'onboarding.page3Subtitle',
    gradientColors: ['#7A5C2E', '#C89B3C'],
    Icon: BookOpen,
  },
  {
    id: '3',
    titleKey: 'onboarding.page4Title',
    subtitleKey: 'onboarding.page4Subtitle',
    gradientColors: ['#0F6B4D', '#29B887'],
    Icon: ShieldCheck,
  },
];

// ============================================================================
// Animated indicator dot — width morphs from 8 → 24 on active.
// Runs on UI thread via Reanimated, no JS bridge cost per frame.
// ============================================================================

interface DotProps {
  active: boolean;
}

const Dot = memo(function Dot({ active }: DotProps) {
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 24 : 8, { damping: 18, stiffness: 200 }),
    opacity: withTiming(active ? 1 : 0.45, { duration: 200, easing: Easing.out(Easing.ease) }),
  }));
  return <Animated.View style={[styles.dot, style]} />;
});

// ============================================================================
// Onboarding screen
// ============================================================================

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { markOnboardingSeen } = useNavigationGate();
  // P0 (Apple 2.1.0 — iPad rejection 2026-04-29): live useWindowDimensions
  // so FlatList page width tracks rotation / split-view / iPad scaling.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= 768;

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // QW-2 (W16-1, 2026-05-22): instrument onboarding lifecycle so we can measure
  // the conversion delta vs. the 4-page baseline.
  useEffect(() => {
    trackEvent('onboarding_started', { total_pages: PAGES.length });
  }, []);

  const finishOnboarding = useCallback(
    (reason: 'completed' | 'skipped') => {
      trackEvent('onboarding_finished', {
        reason,
        last_page_index: currentIndex,
        total_pages: PAGES.length,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      // RUMO-PRAGAS-7/8 fix: do NOT self-navigate. Mark the gate flag (which also
      // persists to AsyncStorage) and let the single source-of-truth routing
      // effect in app/_layout.tsx route to '/(auth)/login' (or '/(tabs)' if the
      // user is already authenticated). Self-navigating here was the same
      // dual-writer pattern that fed the infinite update loop.
      markOnboardingSeen();
    },
    [markOnboardingSeen, currentIndex],
  );

  const goToNext = useCallback(() => {
    if (currentIndex < PAGES.length - 1) {
      const nextIndex = currentIndex + 1;
      try {
        flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      } catch {
        flatListRef.current?.scrollToOffset({
          offset: nextIndex * screenWidth,
          animated: true,
        });
      }
      setCurrentIndex(nextIndex);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      finishOnboarding('completed');
    }
  }, [currentIndex, screenWidth, finishOnboarding]);

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<OnboardingPage>) => {
      const { Icon } = item;
      return (
        <LinearGradient
          colors={item.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.page, { width: screenWidth, height: screenHeight }]}
        >
          {/* Decorative concentric rings behind the icon — adds depth without
              hurting perf (static views, no animation). */}
          <View style={styles.heroLayer} pointerEvents="none">
            <View style={[styles.ring, styles.ringOuter]} />
            <View style={[styles.ring, styles.ringMiddle]} />
            <View style={[styles.ring, styles.ringInner]} />
          </View>

          <View style={[styles.pageContent, isTablet && styles.pageContentTablet]}>
            <View style={[styles.iconContainer, isTablet && styles.iconContainerTablet]}>
              <Icon size={isTablet ? 96 : 64} color={Colors.white} strokeWidth={1.5} />
            </View>
            <Text style={[styles.pageTitle, isTablet && styles.pageTitleTablet]}>
              {t(item.titleKey)}
            </Text>
            <Text style={[styles.pageSubtitle, isTablet && styles.pageSubtitleTablet]}>
              {t(item.subtitleKey)}
            </Text>
          </View>
        </LinearGradient>
      );
    },
    [screenWidth, screenHeight, isTablet, t],
  );

  const isLastPage = currentIndex === PAGES.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={PAGES}
        renderItem={renderPage}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        extraData={screenWidth}
        onMomentumScrollEnd={(e) => {
          if (screenWidth <= 0) return;
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          const clamped = Math.max(0, Math.min(index, PAGES.length - 1));
          if (clamped !== currentIndex) {
            Haptics.selectionAsync().catch(() => {});
          }
          setCurrentIndex(clamped);
        }}
      />

      {/* Skip — top-right, always visible */}
      {!isLastPage ? (
        <View style={styles.topRight}>
          <TouchableOpacity
            onPress={() => finishOnboarding('skipped')}
            style={styles.skipPill}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={t('onboarding.skipA11y')}
            accessibilityRole="button"
            testID="onboarding-skip"
          >
            <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Bottom controls overlay */}
      <View style={[styles.bottomOverlay, isTablet && styles.bottomOverlayTablet]}>
        {/* Animated dot indicators */}
        <View style={styles.dotsContainer}>
          {PAGES.map((page, index) => (
            <Dot key={page.id} active={index === currentIndex} />
          ))}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          onPress={goToNext}
          style={styles.primaryButton}
          activeOpacity={0.85}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={isLastPage ? t('onboarding.startA11y') : t('onboarding.next')}
          accessibilityRole="button"
          accessibilityHint={t('onboarding.pageOf', {
            current: currentIndex + 1,
            total: PAGES.length,
          })}
          testID={isLastPage ? 'onboarding-start' : 'onboarding-next'}
        >
          <Text style={styles.primaryButtonText}>
            {isLastPage ? t('onboarding.startNow') : t('onboarding.next')}
          </Text>
          {!isLastPage ? (
            <View style={styles.arrowCircle}>
              <Text style={styles.arrowGlyph}>›</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {/* Page indicator label for accessibility / a11y users */}
        <Text style={styles.pageOf} accessibilityLiveRegion="polite">
          {t('onboarding.pageOf', { current: currentIndex + 1, total: PAGES.length })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  page: { justifyContent: 'center', alignItems: 'center' },

  // Hero rings
  heroLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -80,
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ringOuter: { width: 360, height: 360 },
  ringMiddle: { width: 260, height: 260, borderColor: 'rgba(255,255,255,0.10)' },
  ringInner: { width: 180, height: 180, borderColor: 'rgba(255,255,255,0.14)' },

  pageContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxxl * 1.5,
    marginTop: -80,
    maxWidth: 520,
  },
  pageContentTablet: {
    paddingHorizontal: Spacing.xxxl * 2,
    marginTop: -120,
    maxWidth: 640,
  },
  iconContainer: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainerTablet: { width: 180, height: 180, borderRadius: 90 },
  pageTitle: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    letterSpacing: -0.5,
  },
  pageTitleTablet: { fontSize: 40 },
  pageSubtitle: {
    fontSize: FontSize.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
  },
  pageSubtitleTablet: { fontSize: 20, lineHeight: 30 },

  // Top-right skip pill
  topRight: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    right: Spacing.lg,
  },
  skipPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  skipText: {
    fontSize: FontSize.footnote,
    color: 'rgba(255,255,255,0.95)',
    fontWeight: FontWeight.medium,
  },

  // Bottom overlay
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 44 : 30,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
  },
  bottomOverlayTablet: {
    paddingHorizontal: Spacing.xxxl * 2,
    paddingBottom: Platform.OS === 'ios' ? 56 : 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },

  // Primary button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.full,
    minHeight: 54,
    minWidth: 220,
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowGlyph: {
    fontSize: 22,
    lineHeight: 24,
    color: Colors.accent,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
    marginTop: -2,
  },
  pageOf: {
    marginTop: 12,
    fontSize: FontSize.caption,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
});
