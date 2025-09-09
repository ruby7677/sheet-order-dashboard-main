import { OrderStatus, PaymentStatus } from './order';

// API 返回的原始訂單資料結構 (Linus式修复：移除字符串解析)
export interface ApiOrder {
  id: string | number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: import('./order').OrderItem[]; // ✅ 结构化数据，不再是垃圾字符串
  amount: string | number;
  status: string;
  createdAt: string;
  deliveryMethod: string;
  deliveryAddress: string;
  dueDate: string;
  deliveryTime: string;
  paymentMethod: string;
  note: string;
  paymentStatus: string;
}

// 向后兼容的适配器接口（处理遗留字符串格式）
export interface LegacyApiOrder {
  id: string | number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: string; // 遗留格式
  amount: string | number;
  status: string;
  createdAt: string;
  deliveryMethod: string;
  deliveryAddress: string;
  dueDate: string;
  deliveryTime: string;
  paymentMethod: string;
  note: string;
  paymentStatus: string;
}

// Linus式转换函数 - 消除所有字符串解析垃圾
export function transformApiOrder(apiOrder: ApiOrder): import('./order').Order {
  return {
    id: String(apiOrder.id),
    orderNumber: apiOrder.orderNumber,
    customer: {
      name: apiOrder.customerName,
      phone: apiOrder.customerPhone
    },
    items: apiOrder.items, // ✅ 直接使用结构化数据，不需要解析
    total: typeof apiOrder.amount === 'string' ? parseFloat(apiOrder.amount) || 0 : apiOrder.amount,
    status: validateOrderStatus(apiOrder.status),
    createdAt: apiOrder.createdAt,
    deliveryMethod: apiOrder.deliveryMethod,
    deliveryAddress: apiOrder.deliveryAddress,
    dueDate: apiOrder.dueDate,
    deliveryTime: apiOrder.deliveryTime,
    paymentMethod: apiOrder.paymentMethod,
    notes: apiOrder.note,
    paymentStatus: validatePaymentStatus(apiOrder.paymentStatus || '')
  };
}

// 向后兼容的适配器函数（仅用于处理遗留数据）
export function transformLegacyApiOrder(legacyOrder: LegacyApiOrder): import('./order').Order {
  // 只在必要时解析遗留字符串格式
  let parsedItems: import('./order').OrderItem[] = [];
  
  if (legacyOrder.items && typeof legacyOrder.items === 'string') {
    try {
      parsedItems = legacyOrder.items.startsWith('[') 
        ? JSON.parse(legacyOrder.items)
        : parseLegacyItemString(legacyOrder.items);
    } catch (e) {
      console.warn('Legacy item parsing failed:', e);
      parsedItems = [];
    }
  }

  return {
    id: String(legacyOrder.id),
    orderNumber: legacyOrder.orderNumber,
    customer: {
      name: legacyOrder.customerName,
      phone: legacyOrder.customerPhone
    },
    items: parsedItems,
    total: typeof legacyOrder.amount === 'string' ? parseFloat(legacyOrder.amount) || 0 : legacyOrder.amount,
    status: validateOrderStatus(legacyOrder.status),
    createdAt: legacyOrder.createdAt,
    deliveryMethod: legacyOrder.deliveryMethod,
    deliveryAddress: legacyOrder.deliveryAddress,
    dueDate: legacyOrder.dueDate,
    deliveryTime: legacyOrder.deliveryTime,
    paymentMethod: legacyOrder.paymentMethod,
    notes: legacyOrder.note,
    paymentStatus: validatePaymentStatus(legacyOrder.paymentStatus || '')
  };
}

// 隔离的遗留解析逻辑
function parseLegacyItemString(itemString: string): import('./order').OrderItem[] {
  return itemString.split(',').map(item => {
    const match = item.trim().match(/(.+)\s+x(\d+)/);
    return match 
      ? { product: match[1], quantity: parseInt(match[2]), price: 0, subtotal: 0 }
      : { product: item.trim(), quantity: 1, price: 0, subtotal: 0 };
  });
}

// Linus式验证函数 - 用Map消除条件分支
const ORDER_STATUS_MAP = new Map<string, OrderStatus>([
  ['pending', '訂單確認中'],
  ['confirmed', '訂單確認中'], 
  ['processing', '已抄單'],
  ['copied', '已抄單'],
  ['shipped', '已出貨'],
  ['delivered', '已出貨'],
  ['cancelled', '取消訂單'],
  ['canceled', '取消訂單'],
  // 直接映射中文状态
  ['訂單確認中', '訂單確認中'],
  ['已抄單', '已抄單'],
  ['已出貨', '已出貨'],
  ['取消訂單', '取消訂單']
]);

const PAYMENT_STATUS_MAP = new Map<string, PaymentStatus>([
  ['unpaid', '未收費'],
  ['paid', '已收費'],
  ['pending_transfer', '待轉帳'],
  ['partial', '未全款'],
  ['special', '特殊'],
  ['', ''],
  // 直接映射中文状态
  ['未收費', '未收費'],
  ['已收費', '已收費'],
  ['待轉帳', '待轉帳'],
  ['未全款', '未全款'],
  ['特殊', '特殊']
]);

function validateOrderStatus(status: string): OrderStatus {
  return ORDER_STATUS_MAP.get(status) || '訂單確認中';
}

function validatePaymentStatus(status: string): PaymentStatus {
  return PAYMENT_STATUS_MAP.get(status) || '未收費';
}
