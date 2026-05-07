import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { Camera, ClipboardList, BookOpen, ShieldCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, FontWeight } from '../constants/theme';
import { Button, Hero } from '../components/ui';

const ONBOARDING_KEY = '@rumo_pragas_onboarding_seen';

interface OnboardingPage {
  id: string;
  titleKey: string;
  subtitleKey: string;
  Icon: typeof Camera;
}

const PAGES: OnboardingPage[] = [
  {
    id: '1',
    titleKey: 'onboarding.page1Title',
    subtitleKey: 'onboarding.page1Subtitle',
    Icon: Camera,
  },
  {
    id: '2',
    titleKey: 'onboarding.page2Title',
    subtitleKey: 'onboarding.page2Subtitle',
    Icon: ClipboardList,
  },
  {
    id: '3',
    titleKey: 'onboarding.page3Title',
    subtitleKey: 'onboarding.page3Subtitle',
    Icon: BookOpen,
  },
  {
    id: '4',
    titleKey: 'onboarding.page4Title',
    subtitleKey: 'onboarding.page4Subtitle',
    Icon: ShieldCheck,
  },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // P0 (Apple Guideline 2.1.0 — iPad rejection 2026-04-29):
  // Use useWindowDimensions() instead of Dimensions.get('window') so the
  // FlatList page width tracks live size changes (rotation, iPad split-view,
  // iPhone-app-on-iPad scaling between 1x/2x). Module-init Dimensions become
  // stale on iPad and break pagingEnabled snapping → "unable to move past
  // onboarding screens".
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= 768;
  // Hero covers top ~55% of the screen; content card overlaps by 24px.
  const heroHeight = Math.round(screenHeight * 0.55);

  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const finishOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {
      // Never block navigation on storage failure — Apple reviewer must
      // always be able to leave this screen.
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    router.replace('/(auth)/login');
  }, [router]);

  const goToNext = useCallback(() => {
    if (currentIndex < PAGES.length - 1) {
      const nextIndex = currentIndex + 1;
      // Defensive: scrollToIndex can throw if the FlatList isn't laid out
      // yet (race on cold start). Fall back to scrollToOffset using the
      // *current* live width and update the indicator dot manually so the
      // user is never trapped on the same page.
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
      finishOnboarding();
    }
  }, [currentIndex, screenWidth, finishOnboarding]);

  const renderPage = useCallback(
    ({ item }: ListRenderItemInfo<OnboardingPage>) => {
      const { Icon } = item;
      return (
        <View style={[styles.page, { width: screenWidth, height: screenHeight }]}>
          {/* Hero covers ~55% top; gradient = Gradients.hero (Hero primitive default). */}
          <Hero topInset={insets.top} style={[styles.hero, { height: heroHeight }]}>
            <View style={styles.heroContent}>
              <View style={[styles.iconCircle, isTablet && styles.iconCircleTablet]}>
                <Icon size={isTablet ? 88 : 64} color={Colors.white} strokeWidth={1.5} />
              </View>
            </View>
          </Hero>

          {/* White content card overlaps the hero by 24px. */}
          <View
            style={[
              styles.contentCard,
              isTablet && styles.contentCardTablet,
              { minHeight: screenHeight - heroHeight + 24 },
            ]}
          >
            <Text style={[styles.pageTitle, isTablet && styles.pageTitleTablet]}>
              {t(item.titleKey)}
            </Text>
            <Text style={[styles.pageSubtitle, isTablet && styles.pageSubtitleTablet]}>
              {t(item.subtitleKey)}
            </Text>
          </View>
        </View>
      );
    },
    [screenWidth, screenHeight, heroHeight, isTablet, t, insets.top],
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
        // Critical for iPad/orientation changes: getItemLayout uses live width
        // so scrollToIndex always lands correctly even if width changed mid-flight.
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        // Re-key the list on width changes so FlatList re-measures children;
        // without this, page widths remain stale after rotation on iPad.
        extraData={screenWidth}
        onMomentumScrollEnd={(e) => {
          if (screenWidth <= 0) return;
          const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
          setCurrentIndex(Math.max(0, Math.min(index, PAGES.length - 1)));
        }}
      />

      {/* Secondary "Pular" link, top-right, above the hero. ALWAYS rendered
          (Apple reviewer must never be stuck) — Skip immediately exits
          onboarding to login. Hidden on the last page (CTA replaces it). */}
      {!isLastPage ? (
        <TouchableOpacity
          onPress={finishOnboarding}
          style={[styles.skipLink, { top: (insets.top || 16) + 4 }]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t('onboarding.skipA11y')}
          accessibilityRole="button"
        >
          <Text style={styles.skipLinkText}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Bottom controls overlay: pagination dots + primary CTA. */}
      <View
        style={[
          styles.bottomOverlay,
          isTablet && styles.bottomOverlayTablet,
          { paddingBottom: (insets.bottom || 16) + Spacing.xl },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.dotsContainer}>
          {PAGES.map((page, index) => (
            <View
              key={page.id}
              style={[styles.dot, index === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        <Button
          block
          size="lg"
          onPress={isLastPage ? finishOnboarding : goToNext}
          accessibilityLabel={isLastPage ? t('onboarding.startA11y') : t('onboarding.next')}
          accessibilityHint={
            isLastPage
              ? undefined
              : t('onboarding.pageOf', {
                  current: currentIndex + 1,
                  total: PAGES.length,
                })
          }
        >
          {isLastPage ? t('onboarding.startNow') : t('onboarding.next')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  page: {
    // Each slide stacks Hero (top) + white card (overlapping).
  },
  hero: {
    // Hero primitive already paints Gradients.hero with rounded bottom corners.
    // We only override absolute height per slide.
    width: '100%',
  },
  heroContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleTablet: {
    width: 168,
    height: 168,
    borderRadius: 84,
  },
  contentCard: {
    backgroundColor: Colors.white,
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  contentCardTablet: {
    paddingHorizontal: Spacing.xxxl * 1.5,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.56, // -0.02em on 28pt
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  pageTitleTablet: {
    fontSize: 34,
    letterSpacing: -0.68,
  },
  pageSubtitle: {
    fontSize: FontSize.body, // 17
    lineHeight: 24,
    color: Colors.textSecondary,
  },
  pageSubtitleTablet: {
    fontSize: 20,
    lineHeight: 28,
  },
  skipLink: {
    position: 'absolute',
    right: Spacing.xl,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    zIndex: 10,
  },
  skipLinkText: {
    fontSize: FontSize.subheadline, // 15
    color: Colors.white,
    fontWeight: FontWeight.semibold,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.xl,
  },
  bottomOverlayTablet: {
    paddingHorizontal: Spacing.xxxl * 2,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.accent,
  },
  dotInactive: {
    width: 6,
    backgroundColor: Colors.systemGray4,
  },
});
