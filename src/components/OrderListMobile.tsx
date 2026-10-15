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
			newPaymentStatus?: '未收費' | '已收費' | '待轉帳' | '未全款' | '特殊' | '',
			newItems?: OrderItem[],
			newTotal?: number
		) => void
	) => void
	onDeleteOrder: (orderId: string) => void
	updateOrderInList: (
		orderId: string,
		newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
		newPaymentStatus?: '未收費' | '已收費' | '待轉帳' | '未全款' | '特殊' | '',
		newItems?: OrderItem[],
		newTotal?: number
	) => void
}

/**
 * 行動版清單（虛擬清單）：渲染卡片式訂單，提升大量資料時的捲動效能
 * 修復版本：改善滾動效能和觸控體驗
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
	if (loading) {
		return (
			<div className="p-4 text-center" aria-label="載入中">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
				<p className="mt-2 text-sm text-muted-foreground">載入訂單資料中...</p>
			</div>
		)
	}

	if (allOrders.length === 0) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				<div className="text-4xl mb-2">📋</div>
				<p>目前沒有訂單資料</p>
			</div>
		)
	}

	return (
		<div aria-label="訂單清單(行動版)" aria-busy={loading}>
			<VirtualizedList
				items={allOrders}
				isLoading={loading}
				estimateSize={120} // 增加估計高度，避免重疊
				overscan={5} // 減少 overscan 以提升效能
				ariaLabel="訂單清單"
				renderItem={(order, index) => (
					<div
						className="mx-2 mb-2 rounded-lg border bg-white shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
						onClick={() => onOrderClick(order, updateOrderInList)}
						style={{ cursor: 'pointer', touchAction: 'manipulation' }}
					>
						<div className="p-3">
							<div className="flex items-start justify-between gap-2 mb-2">
								<div className="flex items-center gap-3 flex-1 min-w-0">
									<label className="flex min-h-11 min-w-11 items-center justify-center" onClick={(e) => e.stopPropagation()}><Checkbox
											checked={selected.includes(order.id)}
											onCheckedChange={(c) => onToggleSelect(order.id, !!c)}
											aria-label={`選擇訂單 ${order.orderNumber}`}
											className="h-4 w-4 flex-shrink-0"
										/></label>
									<div className="flex-1 min-w-0">
										<div className="flex flex-wrap items-center gap-2 mb-1">
											<span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 flex-shrink-0">
												{order.orderNumber}
											</span>
											<span className="font-medium text-slate-900 break-words">
												{order.customer.name}
											</span>
										</div>
										<div className="break-all text-sm text-slate-500 font-mono">
											{order.customer.phone}
										</div>
									</div>
								</div>
								<div onClick={(e) => e.stopPropagation()}>
									<Button
										variant="ghost"
										size="icon"
										className="h-11 w-11 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
										aria-label={`刪除訂單 ${order.orderNumber}`}
										onClick={() => onDeleteOrder(order.id)}
									>
										<Trash className="h-4 w-4" />
									</Button>
								</div>
							</div>

							<div className="text-sm text-slate-700 line-clamp-2 mb-2 break-words">
								{order.items.map((item) => `${item.product} x${item.quantity}`).join('、')}
							</div>

							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 flex-wrap">
									<StatusBadge status={order.status} />
									<PaymentStatusBadge status={order.paymentStatus} />
								</div>
								<div className="text-right">
									<div className="text-lg font-semibold text-slate-900">${order.total}</div>
									{order.dueDate && (
										<div className="text-xs text-slate-500">{order.dueDate}</div>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			/>
		</div>
	)
}

export default OrderListMobile


