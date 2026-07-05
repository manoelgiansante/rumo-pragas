import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('../../constants/theme', () => ({
  FontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    italic: 'Poppins_400Regular_Italic',
  },
  Gradients: { hero: ['#06281D', '#0B3D2E', '#145A45'] },
  FontSize: { title2: 22 },
  FontWeight: { bold: '700' },
}));

import { Avatar } from '../../components/Avatar';

describe('Avatar', () => {
  it('renders an Image when uri is provided', () => {
    const { UNSAFE_getByType } = render(<Avatar uri="https://example.com/me.jpg" name="Manoel" />);
    // Image element exists
    const Image = require('react-native').Image;
    expect(UNSAFE_getByType(Image)).toBeTruthy();
  });

  it('renders gradient fallback with first initial when no uri', () => {
    const { UNSAFE_root } = render(<Avatar name="manoel" />);
    expect(UNSAFE_root.findByProps({ children: 'M' })).toBeTruthy();
  });

  it('renders "?" when name is empty', () => {
    const { UNSAFE_root } = render(<Avatar name="" />);
    expect(UNSAFE_root.findByProps({ children: '?' })).toBeTruthy();
  });

  it('applies the requested size', () => {
    const { UNSAFE_getByType } = render(<Avatar name="A" size={96} />);
    const LinearGradient = 'LinearGradient' as unknown as React.ComponentType;
    const node = UNSAFE_getByType(LinearGradient);
    // Style merging: last entry has the size; flatten and find width/height
    const flat = Array.isArray(node.props.style)
      ? Object.assign({}, ...node.props.style.filter(Boolean))
      : node.props.style;
    expect(flat.width).toBe(96);
    expect(flat.height).toBe(96);
    expect(flat.borderRadius).toBe(48);
  });
});
