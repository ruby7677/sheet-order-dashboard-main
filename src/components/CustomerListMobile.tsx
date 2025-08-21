import React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import VirtualizedList from '@/components/VirtualizedList'
import { CustomerWithStats } from '@/types/customer'

export interface CustomerListMobileProps {
	allCustomers: CustomerWithStats[]
	loading: boolean
	selected: string[]
	onToggleSelect: (id: string) => void
	onCustomerClick: (customer: CustomerWithStats) => void
}

/** 行動版虛擬清單：客戶卡片 */
const CustomerListMobile: React.FC<CustomerListMobileProps> = ({
	allCustomers,
	loading,
	selected,
	onToggleSelect,
	onCustomerClick,
}) => {
	return (
		<div aria-label="客戶清單(行動版)" aria-busy={loading}>
			<VirtualizedList
				items={allCustomers}
				isLoading={loading}
				estimateSize={84}
				ariaLabel="客戶清單"
				renderItem={(c) => (
					<div
						className="m-2 rounded-lg border bg-white p-3 shadow-sm cursor-pointer"
						onClick={() => onCustomerClick(c)}
					>
						<div className="flex items-start gap-2">
							<Checkbox
								checked={selected.includes(c.id)}
								onCheckedChange={() => onToggleSelect(c.id)}
								aria-label={`選擇客戶 ${c.name}`}
							/>
							<div className="flex-1">
								<div className="font-medium text-slate-900">{c.name}</div>
								<div className="text-xs text-slate-500 font-mono">{c.phone}</div>
								<div className="mt-1 text-sm text-slate-700 whitespace-pre-line line-clamp-2">
									{c.purchasedItems.join('、')}
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


