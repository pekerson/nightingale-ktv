export type IntroTimeParts = { minutes: string; seconds: string; milliseconds: string };
export type IntroTimeField = keyof IntroTimeParts;

const LIMITS: Record<IntroTimeField, number> = { minutes: 59, seconds: 59, milliseconds: 999 };
const WIDTHS: Record<IntroTimeField, number> = { minutes: 2, seconds: 2, milliseconds: 3 };

function partValue(field: IntroTimeField, value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isInteger(number) && number <= LIMITS[field] ? number : undefined;
}

export function parseIntroParts(parts: IntroTimeParts): number | undefined {
  const minutes = partValue('minutes', parts.minutes);
  const seconds = partValue('seconds', parts.seconds);
  const millis = partValue('milliseconds', parts.milliseconds);
  if (minutes === undefined || seconds === undefined || millis === undefined) {
    return undefined;
  }
  return minutes * 60 + seconds + millis / 1000;
}

export function formatIntroParts(seconds: number): IntroTimeParts {
  const millis = Math.max(0, Math.round(seconds * 1000));
  return {
    minutes: Math.floor(millis / 60000)
      .toString()
      .padStart(2, '0'),
    seconds: Math.floor((millis % 60000) / 1000)
      .toString()
      .padStart(2, '0'),
    milliseconds: (millis % 1000).toString().padStart(3, '0'),
  };
}

export function normalizeIntroPart(field: IntroTimeField, value: string): string {
  const parsed = partValue(field, value);
  return parsed === undefined ? value : parsed.toString().padStart(WIDTHS[field], '0');
}
