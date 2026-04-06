import { useNetInfo } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string;
}

/**
 * Hook that monitors device network connectivity using NetInfo.
 * Returns connection status, internet reachability, and connection type.
 */
export function useNetworkStatus(): NetworkStatus {
  const netInfo = useNetInfo();

  return {
    isConnected: netInfo.isConnected,
    isInternetReachable: netInfo.isInternetReachable,
    connectionType: netInfo.type,
  };
}
