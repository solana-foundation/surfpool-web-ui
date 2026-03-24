export type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export const getTimeUnitInMs = (unit: string): number => {
  switch (unit) {
    case 'seconds':
      return 1000;
    case 'minutes':
      return 60 * 1000;
    case 'hours':
      return 60 * 60 * 1000;
    case 'days':
      return 24 * 60 * 60 * 1000;
    case 'weeks':
      return 7 * 24 * 60 * 60 * 1000;
    case 'months':
      return 30 * 24 * 60 * 60 * 1000;
    case 'years':
      return 365 * 24 * 60 * 60 * 1000;
    default:
      return 1000;
  }
};
