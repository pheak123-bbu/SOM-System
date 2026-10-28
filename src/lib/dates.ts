function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localFieldsAsUtc(parts: Record<string, string>) {
  return Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
}

export function storeDayStart(date: Date, timeZone: string) {
  const day = partsAt(date, timeZone);
  const target = Date.UTC(Number(day.year), Number(day.month) - 1, Number(day.day));
  let result = target;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const actual = partsAt(new Date(result), timeZone);
    const actualAsUtc = localFieldsAsUtc(actual);
    result += target - actualAsUtc;
  }
  return new Date(result);
}

export function dayStartInZone(date: string, timeZone: string) {
  const expected = date.split("-").map(Number);
  if (expected.length !== 3 || expected.some((part) => !Number.isFinite(part))) throw new Error("Invalid report date.");
  const midnightUtc = Date.UTC(expected[0], expected[1] - 1, expected[2]);
  const normalized = new Date(midnightUtc);
  if (normalized.getUTCFullYear() !== expected[0] || normalized.getUTCMonth() !== expected[1] - 1 || normalized.getUTCDate() !== expected[2]) {
    throw new Error("Invalid report date.");
  }
  let result = midnightUtc;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const actual = partsAt(new Date(result), timeZone);
    const actualAsUtc = localFieldsAsUtc(actual);
    result += midnightUtc - actualAsUtc;
  }
  return new Date(result);
}
