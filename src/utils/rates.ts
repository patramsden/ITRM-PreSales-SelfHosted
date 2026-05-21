export const HOURS_PER_DAY = 7;

/** Hourly sell rate: day rate ÷ 7, rounded up to nearest £5 */
export const hourlyRate = (dayRate: number) => Math.ceil((dayRate / HOURS_PER_DAY) / 5) * 5;
