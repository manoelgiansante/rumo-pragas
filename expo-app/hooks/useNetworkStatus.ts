/* eslint-disable @typescript-eslint/no-var-requires */
import { useEffect, useState } from 'react';

export interface NetworkStatus {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string;
}

// iOS 26 + iPad Reviewer (Apple 2.1(a)) defense:
// `@react-native-community/netinfo` is loaded via a LAZY require() inside
// useEffect (post-mount, after the first paint). Top-level imports of native
// modules can stall bundle eval on the iPad reviewer device. By deferring the
// require we keep the iPad reviewer happy AND degrade gracefully (assume
// online) if the module ever fails to load.

type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
};

type NetInfoModule = {
  default?: { addEventListener: (cb: (s: NetInfoState) => void) => () => void };
  addEventListener?: (cb: (s: NetInfoState) => void) => () => void;
};

/**
 * Hook that monitors device network connectivity using NetInfo.
 * Returns connection status, internet reachability, and connection type.
 *
 * Defaults to online when the native module cannot be loaded — UI never
 * shows a "no connection" banner because of a missing native dep.
 */
export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    connectionType: 'unknown',
  });

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    let mod: NetInfoModule | null = null;
    try {
      mod = require('@react-native-community/netinfo') as NetInfoModule;
    } catch (e) {
      if (__DEV__) console.warn('[useNetworkStatus] require failed (non-fatal):', e);
      return;
    }

    const NetInfo = mod?.default ?? mod;
    const addEventListener = NetInfo?.addEventListener;
    if (typeof addEventListener !== 'function') {
      // Module shape mismatch — degrade to assume online.
      return;
    }

    try {
      unsub = addEventListener((s) => {
        if (cancelled) return;
        setState({
          isConnected: s.isConnected,
          isInternetReachable: s.isInternetReachable,
          connectionType: typeof s.type === 'string' ? s.type : 'unknown',
        });
      });
    } catch (e) {
      if (__DEV__) console.warn('[useNetworkStatus] addEventListener failed:', e);
    }

    return () => {
      cancelled = true;
      try {
        unsub?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return state;
}
