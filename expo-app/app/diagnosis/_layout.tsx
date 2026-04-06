import { Stack } from 'expo-router';

export default function DiagnosisLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
    >
      <Stack.Screen name="camera" />
      <Stack.Screen name="crop-select" />
      <Stack.Screen name="loading" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
