import React, { ReactNode, useRef, useState, useEffect, useCallback } from 'react'

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
 * 修復版虛擬清單組件：
 * - 修復滾動時資料顯示空白的問題
 * - 正確實現狀態管理和滾動事件處理
 * - 當資料量大於 requireVirtualCount 時啟用虛擬化
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
	const [scrollTop, setScrollTop] = useState(0)
	const [clientHeight, setClientHeight] = useState(0)
	const useVirtual = items.length > requireVirtualCount

	// 初始化容器尺寸
	useEffect(() => {
		if (parentRef.current && useVirtual) {
			const updateSize = () => {
				if (parentRef.current) {
					setClientHeight(parentRef.current.clientHeight)
				}
			}
			
			updateSize()
			
			// 監聽視窗大小變化
			const resizeObserver = new ResizeObserver(updateSize)
			resizeObserver.observe(parentRef.current)
			
			return () => {
				resizeObserver.disconnect()
			}
		}
	}, [useVirtual])

	// 優化的滾動事件處理器
	const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
		const element = e.currentTarget
		setScrollTop(element.scrollTop)
	}, [])

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

	// 計算虛擬化參數
	const total = items.length * estimateSize
	const viewport = clientHeight || 600 // 預設高度作為後備
	const startIndex = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan)
	const endIndex = Math.min(items.length - 1, Math.ceil((scrollTop + viewport) / estimateSize) + overscan)

	// 生成可視項目
	const visibleItems = []
	for (let i = startIndex; i <= endIndex; i++) {
		const top = i * estimateSize
		visibleItems.push(
			<div 
				role="listitem" 
				key={i} 
				style={{ 
					position: 'absolute', 
					top, 
					left: 0, 
					right: 0,
					height: estimateSize
				}}
			>
				{renderItem(items[i], i)}
			</div>
		)
	}

	return (
		<div
			ref={parentRef}
			role="list"
			aria-label={ariaLabel}
			aria-busy={!!isLoading}
			className={["relative h-[70dvh] overflow-auto", className].filter(Boolean).join(" ")}
			onScroll={handleScroll}
			style={{ 
				WebkitOverflowScrolling: 'touch', // iOS 平滑滾動
				overflowAnchor: 'none' // 防止滾動錨點問題
			}}
		>
			<div style={{ 
				height: total, 
				position: 'relative', 
				width: '100%',
				minHeight: viewport // 確保最小高度
			}}>
				{visibleItems}
			</div>
		</div>
	)
}

export default VirtualizedList


