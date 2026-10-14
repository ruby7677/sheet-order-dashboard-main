import { z } from 'zod';
import { SELF_PICKUP_ADDRESS, TAIWAN_DISTRICTS } from '../../../src/data/taiwanDistricts';

const text = (maximum: number) => z.string().max(maximum).refine(value => !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value));
export const manualOrderInputSchema = z.object({
  order: z.object({
    requestId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
    catalogRevision: z.number().int().min(1),
    customerName: text(100).refine(value=>value.trim().length>0), phone: text(30).refine(value=>value.trim().length>0),
    deliveryMethod: z.enum(['宅配到府', '7-11門市', '來店自取']),
    district: text(30), area: text(30), address: text(250),
    storeName: text(100), storeAddress: text(250), storeId: text(30),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), preferredTime: z.enum(['上午', '下午', '不指定']),
    contactMethod: z.enum(['Line', 'Facebook', '電話']), socialAccount: text(100),
    paymentMethod: z.enum(['銀行轉帳', '貨到付款']), paymentStatus: z.enum(['未收費', '已收費']).optional(), notes: text(2000),
    products: z.record(z.string().min(1).max(64), z.number().int().min(1).max(100)).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 50),
    totalAmount: z.number().finite().positive().max(50_100_000), shipping: z.number().finite().nonnegative().max(1000),
  }).strict().superRefine((order,context)=>{
    if(order.paymentStatus==='已收費'&&order.paymentMethod!=='銀行轉帳')context.addIssue({code:z.ZodIssueCode.custom,path:['paymentStatus'],message:'已收費僅適用銀行轉帳'});
    if(order.paymentStatus!==undefined&&order.deliveryMethod==='宅配到府'&&(!TAIWAN_DISTRICTS[order.district]?.includes(order.area)||!order.address.trim()))context.addIssue({code:z.ZodIssueCode.custom,path:['area'],message:'宅配縣市、行政區或地址不正確'});
    if(order.paymentStatus!==undefined&&order.deliveryMethod==='來店自取'&&order.address!==SELF_PICKUP_ADDRESS)context.addIssue({code:z.ZodIssueCode.custom,path:['address'],message:'來店自取地點不正確'});
  }),
  send_sms: z.boolean(),
}).strict();
export const manualCheckoutSchema = manualOrderInputSchema.extend({ action: z.literal('create_manual') }).strict();
export type ManualOrderInput = z.infer<typeof manualOrderInputSchema>;

export const manualReceiptSchema = z.object({
  success: z.boolean(), message: z.string().max(300).optional(),
  order_id: z.string().uuid().optional(), safe_to_restart: z.boolean().optional(),
  sms_sent: z.boolean().optional(), reused: z.boolean().optional(),
  stock_confirmation_pending: z.boolean().optional(), customer_sync_pending: z.boolean().optional(),
}).passthrough();
export const manualGatewayResultSchema = z.object({
  status: z.union([z.literal(200), z.literal(400), z.literal(401), z.literal(403), z.literal(409), z.literal(429), z.literal(503)]),
  result: manualReceiptSchema,
}).strict();
