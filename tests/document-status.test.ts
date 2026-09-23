import React from 'react';
import { render } from '@testing-library/react-native';

import ExpiryBadge from '../components/ExpiryBadge';
import { getDocumentStatus, getDocumentStatusLabel } from '../lib/document-status';

const today = new Date(2026, 8, 23, 23, 45);

test.each([
  [null, 'unknown', null, 'No expiry date'],
  ['2026-09-22', 'expired', -1, 'Expired 1 day ago'],
  ['2026-09-23', 'expiring', 0, 'Expires today'],
  ['2026-09-24', 'expiring', 1, 'Expires in 1 day'],
  ['2026-09-30', 'expiring', 7, 'Expires in 7 days'],
  ['2026-10-23', 'expiring', 30, 'Expires in 30 days'],
  ['2026-10-24', 'valid', 31, 'Valid'],
])('%s gives %s status', (expiryDate, kind, daysRemaining, label) => {
  const status = getDocumentStatus(expiryDate, today);
  expect(status).toEqual({ kind, daysRemaining });
  expect(getDocumentStatusLabel(status)).toBe(label);
});

test('uses calendar days across a daylight saving boundary', () => {
  const start = new Date(2026, 2, 7, 23, 50);
  expect(getDocumentStatus('2026-03-08', start).daysRemaining).toBe(1);
  expect(getDocumentStatus('2026-04-06', start).daysRemaining).toBe(30);
});

test('rejects malformed or impossible expiry dates', () => {
  expect(() => getDocumentStatus('2026-02-30', today)).toThrow('expiry');
  expect(() => getDocumentStatus('09/23/2026', today)).toThrow('expiry');
});

test('badge makes missing and expired states explicit', async () => {
  expect((await render(React.createElement(ExpiryBadge, { expiryDate: null, today }))).getByText('No expiry date')).toBeTruthy();
  expect((await render(React.createElement(ExpiryBadge, { expiryDate: '2026-09-22', today }))).getByText('Expired 1 day ago')).toBeTruthy();
});
