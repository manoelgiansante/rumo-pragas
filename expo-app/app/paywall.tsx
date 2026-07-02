import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

// -----------------------------------------------------------------------------
// FREE BUILD (2026-06-30) — fix/pragas-free-2026-06-30
// -----------------------------------------------------------------------------
// The app ships 100% FREE to clear Apple Guideline 2.3.2 (rejection tied to the
// In-App Purchase). There is NO paywall: this route is intentionally neutralised
// so no plans, prices, "Subscribe"/"Assinar" buttons or "Restore Purchases" UI
// can ever be shown — not even via a deep link or a push notification that still
// targets `/paywall`.
//
// The screen renders nothing and immediately returns the user to the app. The
// route is kept registered (app/_layout.tsx) so notification routing and any
// lingering `router.push('/paywall')` call site degrade gracefully instead of
// hitting +not-found.
//
// To re-introduce subscriptions later: revert this commit to restore the full
// RevenueCat paywall (git history). The IAP products (`pragas_pro_monthly` /
// `pragas_pro_annual`) remain as drafts in App Store Connect.
// -----------------------------------------------------------------------------

export default function PaywallScreen() {
  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  return <View />;
}
