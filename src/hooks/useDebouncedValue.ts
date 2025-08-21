import { useEffect, useState } from 'react'

/**
 * 回傳去抖後的值，用於搜尋/篩選輸入等場景
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
	const [debounced, setDebounced] = useState(value)

	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delay)
		return () => clearTimeout(id)
	}, [value, delay])

	return debounced
}

export default useDebouncedValue


