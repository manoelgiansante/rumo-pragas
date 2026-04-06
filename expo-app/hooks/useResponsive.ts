import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isTablet = width >= 768;
  const isLandscape = width > height;
  const contentMaxWidth = isTablet ? 600 : width;
  const numColumns = isTablet ? (isLandscape ? 8 : 6) : 4;

  return { width, height, isTablet, isLandscape, contentMaxWidth, numColumns };
}
