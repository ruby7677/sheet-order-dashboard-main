import { OrderConflict } from './OrderContract';

export interface SheetNameEnv {
  APP_ENV?: string;
  ORDER_SHEET_NAME?: string;
  CUSTOMER_SHEET_NAME?: string;
}

export interface SheetNames {
  orders: string;
  customers: string;
}

const productionNames: SheetNames = { orders: 'Sheet1', customers: '客戶名單' };
const fixtureName = /^security_next_[a-z0-9_]{1,48}$/;

export function getSheetNames(env: SheetNameEnv): SheetNames {
  if (env.APP_ENV === 'production') return productionNames;

  const orders = env.ORDER_SHEET_NAME;
  const customers = env.CUSTOMER_SHEET_NAME;
  if (!orders || !customers || !fixtureName.test(orders) || !fixtureName.test(customers) || orders === customers) {
    throw new OrderConflict(503, 'TEST_SHEET_FIXTURES_REQUIRED', '測試環境必須設定兩個獨立的 security_next_ 工作表');
  }
  return { orders, customers };
}

export function getOrderSheetName(env: SheetNameEnv): string {
  return getSheetNames(env).orders;
}

export function getCustomerSheetName(env: SheetNameEnv): string {
  return getSheetNames(env).customers;
}
