import { minimizeCoordinates } from '../../services/locationPrivacy';

describe('minimizeCoordinates', () => {
  it('rounds positive and negative coordinates to at most two decimals', () => {
    expect(minimizeCoordinates(-23.55052, -46.633308)).toEqual({
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(minimizeCoordinates(12.3456, 45.6789)).toEqual({
      latitude: 12.35,
      longitude: 45.68,
    });
  });

  it('accepts geographic limits and rejects non-finite or out-of-range values', () => {
    expect(minimizeCoordinates(-90, 180)).toEqual({ latitude: -90, longitude: 180 });
    expect(minimizeCoordinates(90.001, 0)).toBeNull();
    expect(minimizeCoordinates(0, -180.001)).toBeNull();
    expect(minimizeCoordinates(Number.NaN, 0)).toBeNull();
    expect(minimizeCoordinates(0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('normalizes negative zero', () => {
    const result = minimizeCoordinates(-0.0001, -0.0001);
    expect(Object.is(result?.latitude, -0)).toBe(false);
    expect(Object.is(result?.longitude, -0)).toBe(false);
  });
});
