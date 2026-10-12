import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import VirtualizedList from '@/components/VirtualizedList'
import { CustomerWithStats } from '@/types/customer'

export interface CustomerListMobileProps {
	allCustomers: CustomerWithStats[]
	loading: boolean
	error?: string
	selected: string[]
	onToggleSelect: (id: string) => void
	onCustomerClick: (customer: CustomerWithStats) => void
}

/** 
 * 行動版虛擬清單：客戶卡片
 * 修復版本：改善滾動效能和觸控體驗
 */
const CustomerListMobile: React.FC<CustomerListMobileProps> = ({
	allCustomers,
	loading,
	error = '',
	selected,
	onToggleSelect,
	onCustomerClick,
}) => {
	if (loading) {
		return (
			<div className="p-4 text-center" aria-label="載入中">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
				<p className="mt-2 text-sm text-muted-foreground">載入客戶資料中...</p>
			</div>
		)
	}

	if (allCustomers.length === 0 && error) {
		return (
			<div className="p-8 text-center text-destructive" role="alert">
				客戶資料無法載入，請重新讀取。
			</div>
		)
	}

	if (allCustomers.length === 0) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				<div className="text-4xl mb-2">👥</div>
				<p>目前沒有客戶資料</p>
			</div>
		)
	}

	return (
		<div aria-label="客戶清單(行動版)" aria-busy={loading}>
			<VirtualizedList
				items={allCustomers}
				isLoading={loading}
				estimateSize={100} // 增加估計高度
				overscan={5} // 減少 overscan 以提升效能
				ariaLabel="客戶清單"
				renderItem={(customer, index) => (
					<div
						className="mx-2 mb-2 rounded-lg border bg-white shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer"
						onClick={() => onCustomerClick(customer)}
						style={{ touchAction: 'manipulation' }}
					>
						<div className="p-3">
							<div className="flex items-start gap-3">
								<div onClick={(e) => e.stopPropagation()}>
									<Checkbox
										checked={selected.includes(customer.id)}
										onCheckedChange={() => onToggleSelect(customer.id)}
										aria-label={`選擇客戶 ${customer.name}`}
										className="flex-shrink-0 mt-0.5"
									/>
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between mb-1">
										<span className="font-medium text-slate-900 truncate">
											{customer.name}
										</span>
										<span className="text-sm font-semibold text-primary flex-shrink-0 ml-2">
											{customer.purchaseCount} 次
										</span>
									</div>
									<div className="text-xs text-slate-500 font-mono mb-2 truncate">
										{customer.phone}
						{customer.normalizedPhone === null && <span className="ml-2 text-amber-700">電話待核對</span>}
									</div>
									<div className="text-xs text-slate-600 mb-2 truncate">
										{customer.region} • {customer.address}
									</div>
									<div className="text-sm text-slate-700 line-clamp-2">
										{customer.purchasedItems.join('、') || '尚未購買'}
									</div>
								</div>
							</div>
						</div>
					</div>
				)}
			/>
		</div>
	)
}

export default CustomerListMobile


