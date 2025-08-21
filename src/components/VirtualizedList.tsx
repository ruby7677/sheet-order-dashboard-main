import React, { ReactNode, useRef } from 'react'

export interface VirtualizedListProps<T> {
	items: T[]
	requireVirtualCount?: number
	estimateSize?: number
	overscan?: number
	renderItem: (item: T, index: number) => ReactNode
	className?: string
	ariaLabel?: string
	isLoading?: boolean
}

/**
 * 輕量虛擬清單（不引入外部依賴）：
 * - 當資料量大於 requireVirtualCount 時啟用簡易虛擬化（固定高度估計）
 * - 小資料量自動降級為一般渲染
 */
export function VirtualizedList<T>({
	items,
	requireVirtualCount = 60,
	estimateSize = 56,
	overscan = 8,
	renderItem,
	className,
	ariaLabel,
	isLoading,
}: VirtualizedListProps<T>) {
	const parentRef = useRef<HTMLDivElement>(null)
	const useVirtual = items.length > requireVirtualCount

	if (!useVirtual) {
		return (
			<div role="list" aria-label={ariaLabel} aria-busy={!!isLoading} className={className}>
				{items.map((item, idx) => (
					<div role="listitem" key={idx}>
						{renderItem(item, idx)}
					</div>
				))}
			</div>
		)
	}

	// 計算可視區塊
	const height = 0
	const total = items.length * estimateSize

	return (
		<div
			ref={parentRef}
			role="list"
			aria-label={ariaLabel}
			aria-busy={!!isLoading}
			className={["relative h-[70dvh] overflow-auto", className].filter(Boolean).join(" ")}
			onScroll={(e) => {
				// 無需控制，使用內部定位容器
			}}
		>
			<div style={{ height: total, position: 'relative', width: '100%' }}>
				{/* 粗略視窗渲染：以目前滾動位置計算起訖 index */}
				{(() => {
					const el = parentRef.current
					const scrollTop = el?.scrollTop || 0
					const viewport = el?.clientHeight || 0
					const startIndex = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan)
					const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + viewport) / estimateSize) + overscan)
					const nodes = [] as ReactNode[]
					for (let i = startIndex; i <= endIndex; i++) {
						const top = i * estimateSize
						nodes.push(
							<div role="listitem" key={i} style={{ position: 'absolute', top, left: 0, right: 0 }}>
								{renderItem(items[i], i)}
							</div>
						)
					}
					return nodes
				})()}
			</div>
		</div>
	)
}

export default VirtualizedList


