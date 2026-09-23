import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockGetDocument = jest.fn();
const mockGetLocalDocumentUri = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockBack = jest.fn();
const mockOpenPresentDocument = jest.fn();
const mockAuthStatus = jest.fn(() => 'signedIn');

jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
}));
jest.mock('../lib/auth', () => ({
  useAuthState: () => ({ status: mockAuthStatus(), userId: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('../lib/present', () => ({ openPresentDocument: (...args: unknown[]) => mockOpenPresentDocument(...args) }));
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
  mockAuthStatus.mockReturnValue('signedIn');
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [{
    id: '33333333-3333-4333-8333-333333333333', userId: '11111111-1111-4111-8111-111111111111',
    displayName: 'RC', mimeType: 'application/pdf',
  }] });
  mockGetLocalDocumentUri.mockResolvedValue('file:///cached/rc.pdf');
  const screen = await render(<DocumentScreen />);
  await waitFor(() => expect(screen.getByText('Viewer: file:///cached/rc.pdf')).toBeTruthy());
  expect(mockGetDocument).not.toHaveBeenCalled();
  expect(mockOpenPresentDocument).not.toHaveBeenCalled();
});

test('an online-only document downloads and opens in the ordinary viewer', async () => {
  mockAuthStatus.mockReturnValue('signedIn');
  const document = {
    id: '33333333-3333-4333-8333-333333333333', userId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Warranty', mimeType: 'application/pdf', type: 'warranty',
  };
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
  mockGetDocument.mockResolvedValue(document);
  mockGetLocalDocumentUri.mockResolvedValue(null);
  mockOpenPresentDocument.mockResolvedValue('file:///cached/warranty.pdf');
  const screen = await render(<DocumentScreen />);
  await waitFor(() => expect(screen.getByText('Viewer: file:///cached/warranty.pdf')).toBeTruthy());
  expect(mockOpenPresentDocument).toHaveBeenCalledWith(document);
});
