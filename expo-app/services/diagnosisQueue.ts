import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@rumo_pragas_diagnosis_queue';

export interface PendingDiagnosis {
  id: string;
  imageBase64: string;
  cropType: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  retryCount: number;
}

export async function addToQueue(
  diagnosis: Omit<PendingDiagnosis, 'id' | 'createdAt' | 'retryCount'>,
): Promise<void> {
  const queue = await getQueue();
  const item: PendingDiagnosis = {
    ...diagnosis,
    id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };
  queue.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<PendingDiagnosis[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingDiagnosis[];
  } catch {
    return [];
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((item) => item.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function getQueueCount(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function incrementRetry(id: string): Promise<void> {
  const queue = await getQueue();
  const updated = queue.map((item) =>
    item.id === id ? { ...item, retryCount: item.retryCount + 1 } : item,
  );
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
}
