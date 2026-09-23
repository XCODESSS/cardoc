import { render } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/index';

jest.mock('../lib/auth', () => ({ useAuthState: () => ({ status: 'signedOut', userId: null }) }));
jest.mock('../lib/offline-index', () => ({ readOfflineIndex: jest.fn() }));

test('opens on the Cardoc screen', async () => {
  const { getByText } = await render(<HomeScreen />);
  expect(getByText('Cardoc')).toBeTruthy();
});
