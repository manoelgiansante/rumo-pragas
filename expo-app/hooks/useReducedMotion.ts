/**
 * useReducedMotion — respects the OS "Reduce Motion" accessibility setting.
 *
 * iOS: Settings → Accessibility → Motion → Reduce Motion
 * Android: Settings → Accessibility → Remove animations
 *
 * Apple HIG (Motion): "If your app supports custom motion, honour the user's
 * Reduce Motion preference by replacing motion with an equivalent dissolve."
 *
 * Usage:
 *   const reduceMotion = useReducedMotion();
 *   const duration = reduceMotion ? 0 : 300;
 *   const scale = useSharedValue(1);
 *   const handlePressIn = () => {
 *     if (reduceMotion) return;          // skip scale entirely
 *     scale.value = withSpring(0.96);
 *   };
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  // Default to `false` — Reanimated/Animated still work normally. Hook returns
  // `true` AFTER the OS reports the user has enabled "Reduce Motion".
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Initial fetch — async on iOS/Android (native bridge call).
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(!!enabled);
      })
      .catch(() => {
        /* swallow: defaulting to `false` is the safe non-degraded path */
      });

    // Live updates — fires when the user toggles the setting at runtime
    // (iOS Control Center accessibility shortcut, Android Quick Settings).
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(!!enabled);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
