/**
 * P1 regression guard: the diagnosis photo resize must NEVER pass both
 * dimensions to expo-image-manipulator — passing width AND height distorts
 * every non-square photo (the exact bug this suite pins down).
 */
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

import { manipulateAsync } from 'expo-image-manipulator';
import {
  buildResizeActions,
  compressImageForDiagnosis,
  JPEG_QUALITY,
  MAX_DIMENSION,
} from '../../lib/imageResize';

const mockManipulateAsync = manipulateAsync as jest.Mock;

type ResizeAction = { resize: { width?: number; height?: number } };

describe('buildResizeActions', () => {
  it('landscape: bounds width only, never passes height', () => {
    const actions = buildResizeActions(4000, 3000) as ResizeAction[];
    expect(actions).toHaveLength(1);
    expect(actions[0]!.resize).toEqual({ width: MAX_DIMENSION });
    expect(actions[0]!.resize).not.toHaveProperty('height');
  });

  it('portrait: bounds height only, never passes width', () => {
    const actions = buildResizeActions(3000, 4000) as ResizeAction[];
    expect(actions).toHaveLength(1);
    expect(actions[0]!.resize).toEqual({ height: MAX_DIMENSION });
    expect(actions[0]!.resize).not.toHaveProperty('width');
  });

  it('square: bounds width only', () => {
    const actions = buildResizeActions(2048, 2048) as ResizeAction[];
    expect(actions).toEqual([{ resize: { width: MAX_DIMENSION } }]);
  });

  it('small image: no resize at all (never upscale)', () => {
    expect(buildResizeActions(800, 600)).toEqual([]);
    expect(buildResizeActions(480, 640)).toEqual([]);
  });

  it('longest side exactly at the limit: no resize', () => {
    expect(buildResizeActions(MAX_DIMENSION, 768)).toEqual([]);
    expect(buildResizeActions(768, MAX_DIMENSION)).toEqual([]);
  });

  it('one pixel over the limit: resizes', () => {
    expect(buildResizeActions(MAX_DIMENSION + 1, 768)).toEqual([
      { resize: { width: MAX_DIMENSION } },
    ]);
  });

  it.each([
    ['undefined dims', undefined, undefined],
    ['zero dims', 0, 0],
    ['NaN dims', Number.NaN, Number.NaN],
    ['negative dims', -10, -20],
    ['only width known', 4000, undefined],
    ['only height known', undefined, 4000],
  ])('%s: falls back to width-only bound (aspect-safe)', (_label, w, h) => {
    const actions = buildResizeActions(w as number | undefined, h as number | undefined);
    expect(actions).toEqual([{ resize: { width: MAX_DIMENSION } }]);
  });

  it('never produces an action carrying both width and height', () => {
    const samples: Array<[number | undefined, number | undefined]> = [
      [4000, 3000],
      [3000, 4000],
      [5000, 5000],
      [1, 99999],
      [99999, 1],
      [undefined, undefined],
    ];
    for (const [w, h] of samples) {
      for (const action of buildResizeActions(w, h) as ResizeAction[]) {
        const keys = Object.keys(action.resize);
        expect(keys.length).toBe(1);
      }
    }
  });
});

describe('compressImageForDiagnosis', () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
    mockManipulateAsync.mockResolvedValue({
      uri: 'file://out.jpg',
      width: 1024,
      height: 768,
      base64: 'Zm9v',
    });
  });

  it('passes an aspect-safe resize (no height) and the JPEG/base64 options', async () => {
    await compressImageForDiagnosis('file://in.jpg', 4000, 3000);
    expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    const [uri, actions, options] = mockManipulateAsync.mock.calls[0]!;
    expect(uri).toBe('file://in.jpg');
    expect(actions).toEqual([{ resize: { width: MAX_DIMENSION } }]);
    expect((actions as ResizeAction[])[0]!.resize).not.toHaveProperty('height');
    expect(options).toEqual({ compress: JPEG_QUALITY, format: 'jpeg', base64: true });
  });

  it('portrait input: resize carries height only (no width)', async () => {
    await compressImageForDiagnosis('file://p.jpg', 3000, 4000);
    const [, actions] = mockManipulateAsync.mock.calls[0]!;
    expect(actions).toEqual([{ resize: { height: MAX_DIMENSION } }]);
    expect((actions as ResizeAction[])[0]!.resize).not.toHaveProperty('width');
  });

  it('small input: re-encodes without any resize action', async () => {
    await compressImageForDiagnosis('file://s.jpg', 640, 480);
    const [, actions] = mockManipulateAsync.mock.calls[0]!;
    expect(actions).toEqual([]);
  });
});
