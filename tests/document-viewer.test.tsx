import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@kishannareshpal/expo-pdf', () => ({
  PdfView: ({ uri, onError }: { uri: string; onError: () => void }) => {
    const { Text } = require('react-native');
    return <Text onPress={onError}>PDF: {uri}</Text>;
  },
}));
jest.mock('expo-image', () => ({
  Image: ({ source, onError }: { source: { uri: string }; onError: () => void }) => {
    const { Text } = require('react-native');
    return <Text onPress={onError}>Image: {source.uri}</Text>;
  },
}));

import DocumentViewer from '../components/DocumentViewer';
import type { CarDocument } from '../types/document';

const baseDocument: CarDocument = {
  id: '33333333-3333-4333-8333-333333333333', userId: '11111111-1111-4111-8111-111111111111',
  vehicleId: '22222222-2222-4222-8222-222222222222', scope: 'vehicle', type: 'insurance',
  displayName: 'Insurance', filePath: 'owner/document.pdf', mimeType: 'application/pdf', sizeBytes: 1024,
  expiryDate: '2027-03-16', offlineAvailable: true, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z',
};

test('local PDF fills viewer and presents essential details', async () => {
  const close = jest.fn();
  const screen = await render(<DocumentViewer document={baseDocument} uri="file:///cached/insurance.pdf" onClose={close} />);
  expect(screen.getByText('PDF: file:///cached/insurance.pdf')).toBeTruthy();
  expect(screen.getByText('Insurance')).toBeTruthy();
  expect(screen.getByText('Valid until 16 March 2027')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close document'));
  expect(close).toHaveBeenCalledTimes(1);
});

test.each(['image/jpeg', 'image/png'] as const)('%s uses local image viewer', async (mimeType) => {
  const screen = await render(<DocumentViewer document={{ ...baseDocument, mimeType }} uri="file:///cached/image" onClose={jest.fn()} />);
  expect(screen.getByText('Image: file:///cached/image')).toBeTruthy();
});

test('render failure hides the document surface and shows a clear error', async () => {
  const screen = await render(<DocumentViewer document={baseDocument} uri="file:///cached/broken.pdf" onClose={jest.fn()} />);
  await fireEvent.press(screen.getByText('PDF: file:///cached/broken.pdf'));
  expect(screen.queryByText('PDF: file:///cached/broken.pdf')).toBeNull();
  expect(screen.getByText('This document could not be displayed.')).toBeTruthy();
});
