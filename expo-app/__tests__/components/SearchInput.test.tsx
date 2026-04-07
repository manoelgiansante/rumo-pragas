import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SearchInput } from '../../components/SearchInput';
import i18n from '../../i18n';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../constants/theme', () => ({
  Colors: {
    text: '#000000',
    textDark: '#FFFFFF',
    textSecondary: '#8E8E93',
  },
  Spacing: {},
  BorderRadius: { lg: 16 },
  FontSize: { body: 17 },
}));

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const defaultPlaceholder = i18n.t('common.searchDefault');
const clearLabel = i18n.t('common.clearSearchA11y');

describe('SearchInput', () => {
  const mockOnChangeText = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with placeholder text', () => {
    const { getByPlaceholderText } = render(
      <SearchInput value="" onChangeText={mockOnChangeText} placeholder="Buscar pragas..." />,
    );
    expect(getByPlaceholderText('Buscar pragas...')).toBeTruthy();
  });

  it('renders with default placeholder when none provided', () => {
    const { getByPlaceholderText } = render(
      <SearchInput value="" onChangeText={mockOnChangeText} />,
    );
    expect(getByPlaceholderText(defaultPlaceholder)).toBeTruthy();
  });

  it('calls onChangeText when text is typed', () => {
    const { getByPlaceholderText } = render(
      <SearchInput value="" onChangeText={mockOnChangeText} placeholder="Buscar..." />,
    );
    const input = getByPlaceholderText('Buscar...');
    fireEvent.changeText(input, 'ferrugem');
    expect(mockOnChangeText).toHaveBeenCalledWith('ferrugem');
  });

  it('shows clear button when value has text', () => {
    const { getByLabelText } = render(<SearchInput value="soja" onChangeText={mockOnChangeText} />);
    expect(getByLabelText(clearLabel)).toBeTruthy();
  });

  it('does not show clear button when value is empty', () => {
    const { queryByLabelText } = render(<SearchInput value="" onChangeText={mockOnChangeText} />);
    expect(queryByLabelText(clearLabel)).toBeNull();
  });

  it('calls onChangeText with empty string when clear button is pressed', () => {
    const { getByLabelText } = render(
      <SearchInput value="milho" onChangeText={mockOnChangeText} />,
    );
    fireEvent.press(getByLabelText(clearLabel));
    expect(mockOnChangeText).toHaveBeenCalledWith('');
  });

  it('has search accessibility label matching placeholder', () => {
    const { getByLabelText } = render(
      <SearchInput value="" onChangeText={mockOnChangeText} placeholder="Buscar cultura..." />,
    );
    expect(getByLabelText('Buscar cultura...')).toBeTruthy();
  });
});
