-- 更新現有產品的庫存狀態，將舊值映射到新值
UPDATE products 
SET stock_status = CASE 
  WHEN stock_status = 'available' THEN 'in_stock'
  WHEN stock_status = 'limited' THEN 'low_stock'
  WHEN stock_status = 'sold_out' THEN 'out_of_stock'
  ELSE stock_status
END
WHERE stock_status IN ('available', 'limited', 'sold_out');

-- 確保所有空值或無效值都設為預設狀態
UPDATE products 
SET stock_status = 'in_stock'
WHERE stock_status IS NULL OR stock_status NOT IN ('in_stock', 'low_stock', 'out_of_stock');