const paymentStatuses = new Set(['未收費', '已收費', '待轉帳', '未全款', '特殊']);

export function parsePaymentUpdate(input: unknown): { rowIndex: number; status: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('付款資料格式錯誤');
  const data = input as Record<string, unknown>;
  const id = typeof data.id === 'number' && Number.isSafeInteger(data.id) ? String(data.id) : data.id;
  if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new Error('訂單 ID 必須是正整數');
  }
  const status = data.status ?? data.paymentStatus;
  if (data.status !== undefined && data.paymentStatus !== undefined && data.status !== data.paymentStatus) {
    throw new Error('付款狀態不一致');
  }
  if (typeof status !== 'string' || !paymentStatuses.has(status)) throw new Error('付款狀態不正確');
  return { rowIndex: Number(id), status };
}
