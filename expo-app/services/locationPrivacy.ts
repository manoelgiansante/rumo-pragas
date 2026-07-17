export interface ApproximateCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Data-minimisation boundary for every coordinate that leaves the location
 * hook. Two decimals are roughly one kilometre and are sufficient for weather
 * and regional pest context without retaining field-level precision.
 */
export function minimizeCoordinates(
  latitude: number,
  longitude: number,
): ApproximateCoordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const round = (value: number): number => {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  return { latitude: round(latitude), longitude: round(longitude) };
}
