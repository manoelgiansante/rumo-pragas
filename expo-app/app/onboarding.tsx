import { useState, useRef, useCallback } from 'react';
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
import { Camera, ClipboardList, BookOpen, ShieldCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

const ONBOARDING_KEY = '@rumo_pragas_onboarding_seen';

interface OnboardingPage {
  id: string;
  titleKey: string;
  subtitleKey: string;
  gradientColors: [string, string];
  Icon: typeof Camera;
}

const PAGES: OnboardingPage[] = [
  {
    id: '1',
    titleKey: 'onboarding.page1Title',
    subtitleKey: 'onboarding.page1Subtitle',
    gradientColors: ['#0F6B4D', '#1A966B'],
    Icon: Camera,
  },
  {
    id: '2',
    titleKey: 'onboarding.page2Title',
    subtitleKey: 'onboarding.page2Subtitle',
    gradientColors: ['#2563EB', '#3B82F6'],
    Icon: ClipboardList,
  },
  {
    id: '3',
    titleKey: 'onboarding.page3Title',
    subtitleKey: 'onboarding.page3Subtitle',
    gradientColors: ['#D97706', '#F59E0B'],
    Icon: BookOpen,
  },
  {
    id: '4',
    titleKey: 'onboarding.page4Title',
    subtitleKey: 'onboarding.page4Subtitle',
    gradientColors: ['#0F6B4D', '#29B887'],
    Icon: ShieldCheck,
  },
];

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // P0 (Apple Guideline 2.1.0 — iPad rejection 2026-04-29):
  // Use useWindowDimensions() instead of Dimensions.get('window') so the
  // FlatList page width tracks live size changes (rotation, iPad split-view,
  // iPhone-app-on-iPad scaling between 1x/2x). Module-init Dimensions become
  // stale on iPad and break pagingEnabled snapping → "unable to move past
  // onboarding screens".
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= 768;

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
        <LinearGradient
          colors={item.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.page, { width: screenWidth, height: screenHeight }]}
        >
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

      {/* Bottom controls overlay */}
      <View style={[styles.bottomOverlay, isTablet && styles.bottomOverlayTablet]}>
        {/* Dot indicators */}
        <View style={styles.dotsContainer}>
          {PAGES.map((page, index) => (
            <View
              key={page.id}
              style={[styles.dot, index === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        {/* Buttons — "Skip" and "Next" are ALWAYS rendered (Apple reviewer
            must never be stuck). Skip immediately exits onboarding to login. */}
        <View style={styles.buttonsContainer}>
          {!isLastPage ? (
            <>
              <TouchableOpacity
                testID="onboarding-skip"
                onPress={finishOnboarding}
                style={styles.skipButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={t('onboarding.skipA11y')}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="onboarding-next"
                onPress={goToNext}
                style={styles.nextButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel={t('onboarding.next')}
                accessibilityRole="button"
                accessibilityHint={t('onboarding.pageOf', {
                  current: currentIndex + 1,
                  total: PAGES.length,
                })}
              >
                <Text style={styles.nextText}>{t('onboarding.next')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              testID="onboarding-start"
              onPress={finishOnboarding}
              style={styles.startButton}
              activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t('onboarding.startA11y')}
              accessibilityRole="button"
            >
              <Text style={styles.startText}>{t('onboarding.startNow')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  page: {
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  },
  iconContainerTablet: {
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  pageTitle: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  pageTitleTablet: {
    fontSize: 40,
  },
  pageSubtitle: {
    fontSize: FontSize.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
  },
  pageSubtitleTablet: {
    fontSize: 20,
    lineHeight: 30,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: Spacing.xxl,
  },
  bottomOverlayTablet: {
    paddingHorizontal: Spacing.xxxl * 2,
    paddingBottom: Platform.OS === 'ios' ? 64 : 40,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.white,
  },
  dotInactive: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: FontSize.body,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: FontWeight.medium,
  },
  nextButton: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    borderRadius: BorderRadius.full,
    minHeight: 44,
    justifyContent: 'center',
  },
  nextText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.semibold,
    color: Colors.accent,
  },
  startButton: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  startText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
});
