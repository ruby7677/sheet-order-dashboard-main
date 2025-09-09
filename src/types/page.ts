// Linus式页面类型 - 简单明确
export type PageMode = 'orders' | 'customers' | 'delivery-settings' | 'products';

export interface PageProps {
  mode: PageMode;
  onModeChange: (mode: PageMode) => void;
}