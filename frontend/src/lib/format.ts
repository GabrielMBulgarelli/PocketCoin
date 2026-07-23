export const formatMinor = (value: number, currency: string, locale: string, maximumFractionDigits = 0) => new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits }).format(value / 100);
export const formatShortDate = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));

const padCalendarPart = (value: number) => String(value).padStart(2, "0");

export const localDateValue = (date = new Date()) => `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}-${padCalendarPart(date.getDate())}`;
export const localMonthValue = (date = new Date()) => `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}`;
export const monthStartValue = (dateValue: string) => `${dateValue.slice(0, 7)}-01`;
export const monthEndValue = (monthValue: string) => {
  const [year, month] = monthValue.split("-").map(Number);
  return `${monthValue}-${padCalendarPart(new Date(year, month, 0).getDate())}`;
};
