import { getShopHoursForDay } from './working-hours.util';

describe('getShopHoursForDay', () => {
  it('matches English day labels (dashboard / provider app data)', () => {
    const hours = [['Monday', '08:00 - 20:00'], ['Saturday', '09:00 - 14:00']];
    expect(getShopHoursForDay(hours, 1)).toEqual({ state: 'open', start: '08:00', end: '20:00' });
    expect(getShopHoursForDay(hours, 6)).toEqual({ state: 'open', start: '09:00', end: '14:00' });
  });

  it('matches French day labels (legacy data), ignoring case and whitespace', () => {
    const hours = [[' lundi ', '08:00 - 18:00'], ['DIMANCHE', '10:00 - 12:00']];
    expect(getShopHoursForDay(hours, 1)).toEqual({ state: 'open', start: '08:00', end: '18:00' });
    expect(getShopHoursForDay(hours, 0)).toEqual({ state: 'open', start: '10:00', end: '12:00' });
  });

  it('reports explicitly closed days', () => {
    const hours = [['Monday', ' - '], ['Tuesday', 'Fermé'], ['Wednesday', '-']];
    expect(getShopHoursForDay(hours, 1)).toEqual({ state: 'closed' });
    expect(getShopHoursForDay(hours, 2)).toEqual({ state: 'closed' });
    expect(getShopHoursForDay(hours, 3)).toEqual({ state: 'closed' });
  });

  it('reports unknown when the day is missing or the hours are unparseable', () => {
    expect(getShopHoursForDay([['Monday', '08:00 - 18:00']], 2)).toEqual({ state: 'unknown' });
    expect(getShopHoursForDay([['Monday', 'sur rendez-vous']], 1)).toEqual({ state: 'unknown' });
    expect(getShopHoursForDay([], 1)).toEqual({ state: 'unknown' });
    expect(getShopHoursForDay(null, 1)).toEqual({ state: 'unknown' });
    expect(getShopHoursForDay('nope', 1)).toEqual({ state: 'unknown' });
  });

  it('zero-pads single-digit hours and accepts an en dash', () => {
    expect(getShopHoursForDay([['Friday', '8:00 – 9:30']], 5)).toEqual({
      state: 'open',
      start: '08:00',
      end: '09:30',
    });
  });
});
