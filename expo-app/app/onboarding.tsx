import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  FlatList,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ClipboardList, BookOpen, ShieldCheck } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const finishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(auth)/login');
  };

  const goToNext = () => {
    if (currentIndex < PAGES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      finishOnboarding();
    }
  };

  const renderPage = ({ item }: { item: OnboardingPage }) => {
    const { Icon } = item;
    return (
      <LinearGradient
        colors={item.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.page}
      >
        <View style={styles.pageContent}>
          <View style={styles.iconContainer}>
            <Icon size={64} color={Colors.white} strokeWidth={1.5} />
          </View>
          <Text style={styles.pageTitle}>{t(item.titleKey)}</Text>
          <Text style={styles.pageSubtitle}>{t(item.subtitleKey)}</Text>
        </View>
      </LinearGradient>
    );
  };

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
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
      />

      {/* Bottom controls overlay */}
      <View style={styles.bottomOverlay}>
        {/* Dot indicators */}
        <View style={styles.dotsContainer}>
          {PAGES.map((page, index) => (
            <View
              key={page.id}
              style={[styles.dot, index === currentIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {!isLastPage ? (
            <>
              <TouchableOpacity
                onPress={finishOnboarding}
                style={styles.skipButton}
                accessibilityLabel={t('onboarding.skipA11y')}
                accessibilityRole="button"
              >
                <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={goToNext}
                style={styles.nextButton}
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
              onPress={finishOnboarding}
              style={styles.startButton}
              activeOpacity={0.8}
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
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxxl * 1.5,
    marginTop: -80,
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
  pageTitle: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  pageSubtitle: {
    fontSize: FontSize.body,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 26,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: Spacing.xxl,
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
  },
  startText: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
});
