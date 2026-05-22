/**
 * Minimal inline mock for react-native-reanimated used in Jest tests.
 *
 * Why not `react-native-reanimated/mock`?
 *   The official mock transitively requires
 *   `react-native-worklets/src/WorkletsModule/NativeWorklets` which throws
 *   `WorkletsErrorConstructor` at module-eval time in Node (no native
 *   worklets runtime available). This shim covers only the APIs our
 *   components actually use:
 *     - useSharedValue / useAnimatedStyle
 *     - withSpring / withTiming / withRepeat / withSequence / withDelay
 *     - cancelAnimation / interpolateColor / runOnJS / Easing
 *     - Animated.View / Animated.Text passthrough (createAnimatedComponent)
 *
 * Animation helpers are synchronous no-ops returning the target value —
 * tests don't assert intermediate frames, so this keeps assertions stable
 * (`expect(...).toHaveStyle({transform:[{scale:1}]})` works after press).
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
const React = require('react');
const { View, Text } = require('react-native');

function useSharedValue(initial) {
  const ref = React.useRef({ value: initial });
  return ref.current;
}

function useAnimatedStyle(fn) {
  try {
    return fn();
  } catch (_e) {
    return {};
  }
}

const passthrough = (val) => val;

// Some withSpring/withTiming callsites pass a completion callback as 3rd arg.
// We invoke it synchronously with `finished=true` so animations that chain
// `runOnJS(...)` (e.g. SuccessCheck haptic) still fire in tests.
function withCallback(val, cfg, cb) {
  if (typeof cfg === 'function') cfg(true);
  if (typeof cb === 'function') cb(true);
  return val;
}

const easingFn = (t) => t;
const easingWrap = (fn) => fn;

const Easing = {
  linear: easingFn,
  ease: easingFn,
  quad: easingFn,
  cubic: easingFn,
  bezier: () => easingFn,
  inOut: easingWrap,
  out: easingWrap,
  in: easingWrap,
};

module.exports = {
  __esModule: true,
  default: {
    View,
    Text,
    createAnimatedComponent: (C) => C,
  },
  View,
  Text,
  useSharedValue,
  useAnimatedStyle,
  withSpring: withCallback,
  withTiming: withCallback,
  withRepeat: passthrough,
  withSequence: passthrough,
  withDelay: (_d, val) => val,
  cancelAnimation: () => {},
  interpolateColor: () => '#000000',
  runOnJS: (fn) => fn,
  Easing,
};
