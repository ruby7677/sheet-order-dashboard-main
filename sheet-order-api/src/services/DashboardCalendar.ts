const TAIPEI = 'Asia/Taipei';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: TAIPEI,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

function dateKey(year: number, month: number, day: number): string | null {
	if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) return null;
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (!Number.isInteger(day) || day < 1 || day > days[month - 1]!) return null;
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function taipeiDateKey(instant: Date): string {
	const parts = Object.fromEntries(dateFormatter.formatToParts(instant).map(part => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

function validTime(hour: number, minute: number, second: number): boolean {
	return Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59 &&
		Number.isInteger(second) && second >= 0 && second <= 59;
}

/** Parse Sheet wall dates directly; only explicit ISO zones are converted as instants to Taipei. */
export function parseSheetOrderDate(value: string): string | null {
	if (typeof value !== 'string' || value.length > 64) return null;
	const input = value.trim();
	if (!input) return null;

	const zoned = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/i.exec(input);
	if (zoned) {
		const [, ys, ms, ds, hs, mins, ss, fraction = '', zone = ''] = zoned;
		const calendarDate = dateKey(Number(ys), Number(ms), Number(ds));
		const hour = Number(hs), minute = Number(mins), second = Number(ss);
		if (!calendarDate || !validTime(hour, minute, second)) return null;
		if (zone.toUpperCase() !== 'Z') {
			const digits = zone.slice(1).replace(':', '');
			const zoneHour = Number(digits.slice(0, 2)), zoneMinute = Number(digits.slice(2, 4));
			if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0)) return null;
		}
		const normalizedZone = zone.toUpperCase() === 'Z' ? 'Z' : `${zone.slice(0, 3)}:${zone.replace(':', '').slice(3, 5)}`;
		const milliseconds = fraction ? `.${fraction.slice(0, 3).padEnd(3, '0')}` : '';
		const instant = new Date(`${calendarDate}T${hs}:${mins}:${ss}${milliseconds}${normalizedZone}`);
		return Number.isNaN(instant.getTime()) ? null : taipeiDateKey(instant);
	}

	const wallTime = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/.exec(input);
	if (wallTime) {
		const [, year, , month, day, hour, minute, second] = wallTime;
		return validTime(Number(hour), Number(minute), Number(second))
			? dateKey(Number(year), Number(month), Number(day))
			: null;
	}
	const usWallTime = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/.exec(input);
	if (usWallTime) {
		const [, month, day, year, hour, minute, second] = usWallTime;
		return validTime(Number(hour), Number(minute), Number(second))
			? dateKey(Number(year), Number(month), Number(day))
			: null;
	}

	const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
	if (isoDate) return dateKey(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

	const slashYearFirst = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(input);
	if (slashYearFirst) return dateKey(Number(slashYearFirst[1]), Number(slashYearFirst[2]), Number(slashYearFirst[3]));

	const slashMonthFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
	if (slashMonthFirst) return dateKey(Number(slashMonthFirst[3]), Number(slashMonthFirst[1]), Number(slashMonthFirst[2]));
	return null;
}

function subtractDays(date: string, days: number): string {
	const [year, month, day] = date.split('-').map(Number);
	const value = new Date(0);
	value.setUTCFullYear(year!, month! - 1, day! - days);
	value.setUTCHours(0, 0, 0, 0);
	return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function weekStartSunday(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	const weekdayDate = new Date(0);
	weekdayDate.setUTCFullYear(year!, month! - 1, day!);
	weekdayDate.setUTCHours(0, 0, 0, 0);
	return subtractDays(date, weekdayDate.getUTCDay());
}

export function countDashboardOrderDates(values: string[], now: Date = new Date()): { todayOrders: number; weekOrders: number } {
	const today = taipeiDateKey(now);
	const weekStart = weekStartSunday(today);
	let todayOrders = 0;
	let weekOrders = 0;
	for (const value of values) {
		const orderDate = parseSheetOrderDate(value);
		if (!orderDate) continue;
		if (orderDate === today) todayOrders++;
		if (orderDate >= weekStart && orderDate <= today) weekOrders++;
	}
	return { todayOrders, weekOrders };
}
