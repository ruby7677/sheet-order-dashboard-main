import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import StatusBadge from './StatusBadge'
import PaymentStatusBadge from './PaymentStatusBadge'
import { Trash } from 'lucide-react'
import { Order, OrderItem } from '@/types/order'
import VirtualizedList from '@/components/VirtualizedList'

export interface OrderListMobileProps {
	allOrders: Order[]
	loading: boolean
	selected: string[]
	onToggleSelect: (orderId: string, checked: boolean) => void
	onOrderClick: (
		order: Order,
		updateOrderInList: (
			orderId: string,
			newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
			newPaymentStatus?: any,
			newItems?: OrderItem[],
			newTotal?: number
		) => void
	) => void
	onDeleteOrder: (orderId: string) => void
	updateOrderInList: (
		orderId: string,
		newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
		newPaymentStatus?: any,
		newItems?: OrderItem[],
		newTotal?: number
	) => void
}

/**
 * 行動版清單（虛擬清單）：渲染卡片式訂單，提升大量資料時的捲動效能
 */
const OrderListMobile: React.FC<OrderListMobileProps> = ({
	allOrders,
	loading,
	selected,
	onToggleSelect,
	onOrderClick,
	onDeleteOrder,
	updateOrderInList,
}) => {
	return (
		<div aria-label="訂單清單(行動版)" aria-busy={loading}>
			<VirtualizedList
				items={allOrders}
				isLoading={loading}
				estimateSize={92}
				ariaLabel="訂單清單"
				renderItem={(order) => (
					<div
						className="m-2 rounded-lg border bg-white p-3 shadow-sm"
						onClick={() => onOrderClick(order, updateOrderInList)}
					>
						<div className="flex items-start justify-between gap-2">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={selected.includes(order.id)}
									onCheckedChange={(c) => onToggleSelect(order.id, !!c)}
									aria-label={`選擇訂單 ${order.orderNumber}`}
								/>
								<div>
									<div className="font-medium text-slate-900">
										<span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded mr-2">{order.orderNumber}</span>
										{order.customer.name}
									</div>
									<div className="text-xs text-slate-500 font-mono">{order.customer.phone}</div>
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`刪除訂單 ${order.orderNumber}`}
								onClick={(e) => { e.stopPropagation(); onDeleteOrder(order.id); }}
							>
								<Trash className="h-4 w-4" />
							</Button>
						</div>
						<div className="mt-2 text-sm text-slate-700 whitespace-pre-line">
							{order.items.map((it) => `${it.product} x${it.quantity}`).join('、')}
						</div>
						<div className="mt-2 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<StatusBadge status={order.status as any} />
								<PaymentStatusBadge status={order.paymentStatus as any} />
							</div>
							<div className="text-right text-sm font-semibold text-slate-900">${order.total}</div>
						</div>
					</div>
				)}
			/>
		</div>
	)
}

export default OrderListMobile


