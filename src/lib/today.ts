import { addDays, todayIn } from '../../shared/dates';

export const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Today's date on this device. */
export function localToday(): string {
  return todayIn(localTimeZone());
}

export function localYesterday(): string {
  return addDays(localToday(), -1);
}
