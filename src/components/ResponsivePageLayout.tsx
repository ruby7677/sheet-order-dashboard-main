import React, { ReactNode, useEffect, useRef } from 'react'

export interface BreadcrumbItem {
	label: string
	href?: string
}

export interface ResponsivePageLayoutProps {
	title: string
	description?: string
	breadcrumbs?: BreadcrumbItem[]
	actions?: ReactNode
	sidebar?: ReactNode
	children: ReactNode
}

/**
 * 一致的頁面骨架：含 Skip Link、landmarks、標題/描述/操作列與可選側邊欄
 * - 改善資訊架構與無障礙（skip-to-content、main landmark、ARIA 標示）
 */
export function ResponsivePageLayout({
	title,
	description,
	breadcrumbs,
	actions,
	sidebar,
	children,
}: ResponsivePageLayoutProps) {
	const mainRef = useRef<HTMLElement>(null)

	useEffect(() => {
		mainRef.current?.focus()
	}, [])

	return (
		<div className="min-h-dvh bg-background text-foreground">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 rounded bg-primary px-3 py-2 text-primary-foreground"
			>
				跳到主內容
			</a>

			<header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-3 sm:px-4">
					<div className="flex items-center gap-3">
						<nav aria-label="breadcrumb">
							<ol className="flex items-center gap-2 text-sm text-muted-foreground">
								{breadcrumbs?.map((b, i) => (
									<li key={i} className="flex items-center gap-2">
										{i > 0 && <span className="opacity-60">/</span>}
										{b.href ? (
											<a className="hover:underline" href={b.href}>
												{b.label}
											</a>
										) : (
											<span aria-current="page" className="font-medium text-foreground">
												{b.label}
											</span>
										)}
									</li>
								))}
							</ol>
						</nav>
					</div>
					<div className="flex items-center gap-2">{actions}</div>
				</div>
			</header>

			<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[280px_1fr]">
				{sidebar && (
					<aside className="lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)]" aria-label="側邊導覽">
						{sidebar}
					</aside>
				)}

				<main
					id="main"
					ref={mainRef}
					tabIndex={-1}
					aria-label="主內容"
					className="outline-none"
				>
					<div className="mb-4">
						<h1 className="text-xl font-semibold leading-tight md:text-2xl">{title}</h1>
						{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
					</div>
					{children}
				</main>
			</div>
		</div>
	)
}

export default ResponsivePageLayout


