const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
});

export function formatPrice(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

export function formatUnixTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function formatIsoTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
