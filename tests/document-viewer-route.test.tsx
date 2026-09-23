import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockGetDocument = jest.fn();
const mockGetLocalDocumentUri = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
}));
jest.mock('../lib/auth', () => ({
  useAuthState: () => ({ status: 'signedIn', userId: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('../lib/documents', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  getLocalDocumentUri: (...args: unknown[]) => mockGetLocalDocumentUri(...args),
}));
jest.mock('../lib/offline-index', () => ({
  readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args),
}));
jest.mock('../components/DocumentViewer', () => ({
  __esModule: true,
  default: ({ uri }: { uri: string }) => {
    const { Text } = require('react-native');
    return <Text>Viewer: {uri}</Text>;
  },
}));

import DocumentScreen from '../app/document/[id]';

test('a signed-in cached document opens without a cloud request', async () => {
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [{
    id: '33333333-3333-4333-8333-333333333333', userId: '11111111-1111-4111-8111-111111111111',
    displayName: 'RC', mimeType: 'application/pdf',
  }] });
  mockGetLocalDocumentUri.mockResolvedValue('file:///cached/rc.pdf');
  const screen = await render(<DocumentScreen />);
  await waitFor(() => expect(screen.getByText('Viewer: file:///cached/rc.pdf')).toBeTruthy());
  expect(mockGetDocument).not.toHaveBeenCalled();
});
