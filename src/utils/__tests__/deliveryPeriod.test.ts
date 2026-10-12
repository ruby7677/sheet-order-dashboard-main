import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeliveryPeriodRange, parseCalendarDateKey } from '../deliveryPeriod';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getDeliveryPeriodRange', () => {
  it('uses the Taipei calendar date when UTC and Taipei are on different days', () => {
    const beforeTaipeiMonday = new Date('2026-10-04T15:59:59.000Z');
    const afterTaipeiMonday = new Date('2026-10-04T16:00:00.000Z');

    expect(getDeliveryPeriodRange(beforeTaipeiMonday, 'current')).toEqual({
      startDate: '2026-09-30',
      endDate: '2026-10-03',
    });
    expect(getDeliveryPeriodRange(afterTaipeiMonday, 'current')).toEqual({
      startDate: '2026-10-07',
      endDate: '2026-10-10',
    });
  });

  it('calculates adjacent Monday-based weeks across month and year boundaries', () => {
    const sunday = new Date('2026-10-04T05:00:00.000Z');
    expect(getDeliveryPeriodRange(sunday, 'previous')).toEqual({
      startDate: '2026-09-23',
      endDate: '2026-09-26',
    });
    expect(getDeliveryPeriodRange(sunday, 'next')).toEqual({
      startDate: '2026-10-07',
      endDate: '2026-10-10',
    });

    const yearBoundarySunday = new Date('2026-01-04T05:00:00.000Z');
    expect(getDeliveryPeriodRange(yearBoundarySunday, 'previous')).toEqual({
      startDate: '2025-12-24',
      endDate: '2025-12-27',
    });
    expect(getDeliveryPeriodRange(yearBoundarySunday, 'current')).toEqual({
      startDate: '2025-12-31',
      endDate: '2026-01-03',
    });
  });

  it('rejects an invalid reference instant', () => {
    expect(() => getDeliveryPeriodRange(new Date(Number.NaN), 'current')).toThrow(RangeError);
  });

  it('is independent of the host timezone', () => {
    const instant = new Date('2026-10-04T15:59:59.000Z');
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const losAngeles = getDeliveryPeriodRange(instant, 'current');
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    const honolulu = getDeliveryPeriodRange(instant, 'current');

    expect(honolulu).toEqual(losAngeles);
    expect(honolulu).toEqual({ startDate: '2026-09-30', endDate: '2026-10-03' });
  });

  it('normalizes supported calendar strings and rejects rollovers and timestamps', () => {
    expect(parseCalendarDateKey('2026-02-03')).toBe('2026-02-03');
    expect(parseCalendarDateKey('2026/2/3')).toBe('2026-02-03');
    expect(parseCalendarDateKey('2026/02/30')).toBeNull();
    expect(parseCalendarDateKey('2026-02-30')).toBeNull();
    expect(parseCalendarDateKey('2026-10-07T00:00:00Z')).toBeNull();
    expect(parseCalendarDateKey('2026/10/7 ')).toBeNull();
  });
});
