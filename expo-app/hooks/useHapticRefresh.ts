/**
 * useHapticRefresh — wraps a refresh handler so pull-to-refresh fires a haptic
 * the moment the spinner appears and another on completion.
 *
 * The native `<RefreshControl>` already gives us the iOS rubber-band feel; we
 * just layer tactile feedback on top so the pull feels "expensive" (paying-app
 * polish). Apple Mail, Apollo, and Things3 all do this.
 *
 * Usage:
 *   const { refreshing, onRefresh } = useHapticRefresh(loadData);
 *   <ScrollView refreshControl={
 *     <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
 *   } />
 */
import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';

export function useHapticRefresh(load: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    // Start haptic — light pulse when spinner appears (matches iOS Mail).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRefreshing(true);
    try {
      await load();
      // Completion: subtle success notification so the user knows fresh data
      // arrived (vs. a silent stop, which feels unfinished).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      // Surface a warning haptic so a silent fetch error isn't completely silent.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { refreshing, onRefresh };
}
