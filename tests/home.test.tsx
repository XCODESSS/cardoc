import { render } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/index';

test('opens on the Cardoc screen', async () => {
  const { getByText } = await render(<HomeScreen />);
  expect(getByText('Cardoc')).toBeTruthy();
});
