import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function DiagnosisLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade',
      }}
    >
      {/* Entry screen keeps the modal slide-up, inner screens slide right (iOS) / fade (Android) */}
      <Stack.Screen name="camera" />
      <Stack.Screen
        name="crop-select"
        options={{
          presentation: 'card',
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      />
      <Stack.Screen
        name="loading"
        options={{
          presentation: 'card',
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      />
      <Stack.Screen
        name="result"
        options={{
          presentation: 'card',
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      />
      {/* Pest fact sheet — Pro feature, reachable from result and history */}
      <Stack.Screen
        name="pest/[id]"
        options={{
          presentation: 'card',
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'fade',
        }}
      />
    </Stack>
  );
}
