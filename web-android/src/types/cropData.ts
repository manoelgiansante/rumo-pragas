import { CropTypeKey } from './index';

export interface CropInfo {
  key: CropTypeKey;
  displayName: string;
  apiName: string;
  icon: string; // MaterialCommunityIcons name
  accentColor: string;
}

export const CROPS: CropInfo[] = [
  { key: 'soja', displayName: 'Soja', apiName: 'Soybean', icon: 'leaf', accentColor: '#2E8C3D' },
  { key: 'milho', displayName: 'Milho', apiName: 'Corn', icon: 'corn', accentColor: '#D9AD26' },
  { key: 'cafe', displayName: 'Café', apiName: 'Coffee', icon: 'coffee', accentColor: '#8C5429' },
  { key: 'algodao', displayName: 'Algodão', apiName: 'Cotton', icon: 'cloud', accentColor: '#BFBFC7' },
  { key: 'cana', displayName: 'Cana-de-açúcar', apiName: 'Sugarcane', icon: 'grass', accentColor: '#4DA64D' },
  { key: 'trigo', displayName: 'Trigo', apiName: 'Wheat', icon: 'barley', accentColor: '#C7A333' },
  { key: 'arroz', displayName: 'Arroz', apiName: 'Rice', icon: 'water', accentColor: '#66B38C' },
  { key: 'feijao', displayName: 'Feijão', apiName: 'Bean', icon: 'seed', accentColor: '#995933' },
  { key: 'batata', displayName: 'Batata', apiName: 'Potato', icon: 'food-variant', accentColor: '#B8944D' },
  { key: 'tomate', displayName: 'Tomate', apiName: 'Tomato', icon: 'fruit-cherries', accentColor: '#D9382E' },
  { key: 'mandioca', displayName: 'Mandioca', apiName: 'Cassava', icon: 'tree', accentColor: '#806640' },
  { key: 'citros', displayName: 'Citros', apiName: 'Citrus', icon: 'fruit-citrus', accentColor: '#E69919' },
  { key: 'uva', displayName: 'Uva', apiName: 'Grape', icon: 'fruit-grapes', accentColor: '#80338C' },
  { key: 'banana', displayName: 'Banana', apiName: 'Banana', icon: 'food-banana', accentColor: '#E6D133' },
  { key: 'sorgo', displayName: 'Sorgo', apiName: 'Sorghum', icon: 'chart-bar', accentColor: '#A67338' },
  { key: 'amendoim', displayName: 'Amendoim', apiName: 'Peanut', icon: 'peanut', accentColor: '#B88547' },
  { key: 'girassol', displayName: 'Girassol', apiName: 'Sunflower', icon: 'white-balance-sunny', accentColor: '#F2BF19' },
  { key: 'cebola', displayName: 'Cebola', apiName: 'Onion', icon: 'bullseye', accentColor: '#AD6B8C' },
];

export function getCropByKey(key: string): CropInfo | undefined {
  return CROPS.find(c => c.key === key);
}

export function getCropByApiName(apiName: string): CropInfo | undefined {
  return CROPS.find(c => c.apiName.toLowerCase() === apiName.toLowerCase());
}
