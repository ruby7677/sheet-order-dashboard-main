import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeliverySetting, listSettingsProducts, saveSettingsProduct } from '../settingsApi';

afterEach(() => vi.unstubAllGlobals());

describe('settings reads from the running storefront', () => {
  it('preserves product IDs, weight text and the meaning of stock statuses', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ success: true, revision:4,read_only:false,data: [{
      id: 'radishCake', name: '測試商品', price: 100, weight: '600±20g', unit: '條',
      stock_quantity: 0, stock_status: 'sold_out', is_active: true, ingredients: ['米', '蘿蔔'],
    }] }));
    vi.stubGlobal('fetch', request);
    const result = await listSettingsProducts(),data=result.data;
    expect(String(request.mock.calls[0][0])).toContain('/api/settings/products');
    expect(data[0].product_id).toBe('radishCake');
    expect(data[0].weight).toBe('600±20g');
    expect(data[0].stock_status).toBe('out_of_stock');
    expect(data[0].stock_quantity).toBe(0);
    expect(result.revision).toBe(4);expect(result.readOnly).toBe(false);
  });

  it('uses the actual period and Sunday rules instead of inventing defaults', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data: {
      delivery_period: { start_date: '2026-10-01', end_date: '2026-10-02' },
      delivery_rules: { home_delivery: { exclude_sunday: false }, store_pickup: { exclude_sunday: true } },
    } })));
    const result = await getDeliverySetting(),setting=result.data;
    expect(setting.start_date).toBe('2026-10-01');
    expect(setting.excludeHomeSunday).toBe(false);
    expect(setting.excludeStoreSunday).toBe(true);
    expect(result.readOnly).toBe(true);
  });
  it('sends a versioned save and shows stale-version errors',async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({success:false,message:'設定已更新，請重新載入'},{status:409}));vi.stubGlobal('fetch',fetch);
    await expect(saveSettingsProduct({product_id:'one',name:'Fixture',price:100,stock_quantity:3,stock_status:'in_stock'},8)).rejects.toThrow('重新載入');
    const [url,options]=fetch.mock.calls[0];expect(url).toContain('/api/settings/products/one');expect(JSON.parse(options.body).expected_revision).toBe(8);expect(options.credentials).toBe('same-origin');
  });
});
