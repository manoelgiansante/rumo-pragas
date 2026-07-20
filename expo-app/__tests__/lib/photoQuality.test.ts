import { assessPhotoQuality, MIN_BYTES_PER_PIXEL, MIN_SHORT_SIDE_PX } from '../../lib/photoQuality';

/** base64 length that yields exactly `bytes` decoded bytes (len × 3/4). */
const base64LengthForBytes = (bytes: number): number => Math.ceil((bytes * 4) / 3);

/** A comfortable "good photo" base64 length for a given output pixel count. */
const goodBase64Length = (pixels: number): number =>
  base64LengthForBytes(Math.ceil(pixels * MIN_BYTES_PER_PIXEL * 4));

const GOOD_OUTPUT = { outputWidth: 1024, outputHeight: 768 };
const GOOD_PIXELS = 1024 * 768;

describe('assessPhotoQuality — low_resolution (asset short side)', () => {
  it('flags a tiny asset (short side below the floor)', () => {
    const issues = assessPhotoQuality({
      assetWidth: 320,
      assetHeight: 240,
      base64Length: goodBase64Length(320 * 240),
      outputWidth: 320,
      outputHeight: 240,
    });
    expect(issues).toContain('low_resolution');
  });

  it('uses the SHORT side: 4000×300 panorama is still low resolution', () => {
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 300,
      base64Length: goodBase64Length(1024 * 77),
      outputWidth: 1024,
      outputHeight: 77,
    });
    expect(issues).toContain('low_resolution');
  });

  it('short side exactly at the floor passes (strict less-than)', () => {
    const issues = assessPhotoQuality({
      assetWidth: MIN_SHORT_SIDE_PX,
      assetHeight: 4000,
      base64Length: goodBase64Length(GOOD_PIXELS),
      ...GOOD_OUTPUT,
    });
    expect(issues).not.toContain('low_resolution');
  });

  it('one pixel below the floor flags', () => {
    const issues = assessPhotoQuality({
      assetWidth: MIN_SHORT_SIDE_PX - 1,
      assetHeight: 4000,
      base64Length: goodBase64Length(GOOD_PIXELS),
      ...GOOD_OUTPUT,
    });
    expect(issues).toContain('low_resolution');
  });

  it.each([
    ['missing dims', undefined, undefined],
    ['zero dims', 0, 0],
    ['NaN dims', Number.NaN, Number.NaN],
    ['only one dim known', 240, undefined],
  ])('no verdict when asset dims are untrustworthy (%s)', (_label, w, h) => {
    const issues = assessPhotoQuality({
      assetWidth: w as number | undefined,
      assetHeight: h as number | undefined,
      base64Length: goodBase64Length(GOOD_PIXELS),
      ...GOOD_OUTPUT,
    });
    expect(issues).not.toContain('low_resolution');
  });
});

describe('assessPhotoQuality — low_detail (bytes per pixel of compressed JPEG)', () => {
  it('flags a near-flat/dark image (far below the floor)', () => {
    // ~0.01 B/px — a near-black frame.
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: base64LengthForBytes(Math.floor(GOOD_PIXELS * 0.01)),
      ...GOOD_OUTPUT,
    });
    expect(issues).toEqual(['low_detail']);
  });

  it('passes a normal photo (well above the floor)', () => {
    // ~0.16 B/px — typical in-focus field photo at q0.75.
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: base64LengthForBytes(Math.floor(GOOD_PIXELS * 0.16)),
      ...GOOD_OUTPUT,
    });
    expect(issues).toEqual([]);
  });

  it('exactly at the floor passes (strict less-than)', () => {
    const exactBytes = GOOD_PIXELS * MIN_BYTES_PER_PIXEL;
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: (exactBytes * 4) / 3, // integral for these values
      ...GOOD_OUTPUT,
    });
    expect(issues).toEqual([]);
  });

  it('just below the floor flags', () => {
    const exactBytes = GOOD_PIXELS * MIN_BYTES_PER_PIXEL;
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: (exactBytes * 4) / 3 - 400,
      ...GOOD_OUTPUT,
    });
    expect(issues).toEqual(['low_detail']);
  });

  it.each([
    ['missing output dims', undefined, undefined, 100_000],
    ['zero output dims', 0, 0, 100_000],
    ['zero base64 length', 1024, 768, 0],
    ['NaN base64 length', 1024, 768, Number.NaN],
  ])('no verdict when signals are untrustworthy (%s)', (_label, w, h, len) => {
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: len as number,
      outputWidth: w as number | undefined,
      outputHeight: h as number | undefined,
    });
    expect(issues).not.toContain('low_detail');
  });
});

describe('assessPhotoQuality — combined', () => {
  it('reports both issues for a tiny dark image', () => {
    const issues = assessPhotoQuality({
      assetWidth: 200,
      assetHeight: 200,
      base64Length: base64LengthForBytes(400), // 0.01 B/px on 200×200
      outputWidth: 200,
      outputHeight: 200,
    });
    expect(issues).toEqual(['low_resolution', 'low_detail']);
  });

  it('reports nothing when every signal is healthy', () => {
    const issues = assessPhotoQuality({
      assetWidth: 4000,
      assetHeight: 3000,
      base64Length: base64LengthForBytes(Math.floor(GOOD_PIXELS * 0.2)),
      ...GOOD_OUTPUT,
    });
    expect(issues).toEqual([]);
  });
});
