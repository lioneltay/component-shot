import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from 'react'

import type { ComponentShotViewport } from './runtime/types.js'

type ResizeDirection = 'both' | 'height' | 'width'

type ResizeSession = {
	direction: ResizeDirection
	pointerId: number
	scale: number
	startViewport: ComponentShotViewport
	startX: number
	startY: number
}

const labels: Record<ResizeDirection, string> = {
	both: 'Resize viewport width and height',
	height: 'Resize viewport height',
	width: 'Resize viewport width',
}

export const ViewportDimensionInput = ({
	dataAttribute,
	label,
	max,
	min,
	onCommit,
	value,
}: {
	dataAttribute: 'height' | 'width'
	label: string
	max: number
	min: number
	onCommit: (value: number) => void
	value: number
}) => {
	const [draft, setDraft] = useState(String(value))
	const [editing, setEditing] = useState(false)
	const cancelCommitRef = useRef(false)

	useEffect(() => {
		if (!editing) setDraft(String(value))
	}, [editing, value])

	const commit = () => {
		if (cancelCommitRef.current) {
			cancelCommitRef.current = false
			setDraft(String(value))
			setEditing(false)
			return
		}
		const numeric = Number(draft)
		if (draft.trim() && Number.isFinite(numeric)) onCommit(numeric)
		else setDraft(String(value))
		setEditing(false)
	}

	return (
		<input
			aria-label={label}
			data-viewport-height={dataAttribute === 'height' ? true : undefined}
			data-viewport-width={dataAttribute === 'width' ? true : undefined}
			inputMode="numeric"
			max={max}
			min={min}
			onBlur={commit}
			onChange={(event) => setDraft(event.target.value)}
			onFocus={() => {
				cancelCommitRef.current = false
				setEditing(true)
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur()
				if (event.key === 'Escape') {
					event.preventDefault()
					cancelCommitRef.current = true
					event.currentTarget.blur()
				}
			}}
			type="number"
			value={draft}
		/>
	)
}

export const ViewportResizeHandles = ({
	onResize,
	scale,
	viewport,
}: {
	onResize: (viewport: ComponentShotViewport) => void
	scale: number
	viewport: ComponentShotViewport
}) => {
	const sessionRef = useRef<ResizeSession>()
	const [activeDirection, setActiveDirection] = useState<ResizeDirection>()

	const beginResize = (
		direction: ResizeDirection,
		event: ReactPointerEvent<HTMLButtonElement>,
	) => {
		if (event.button !== 0) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		sessionRef.current = {
			direction,
			pointerId: event.pointerId,
			scale: Math.max(scale, 0.01),
			startViewport: viewport,
			startX: event.clientX,
			startY: event.clientY,
		}
		setActiveDirection(direction)
	}

	const moveResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const session = sessionRef.current
		if (!session || session.pointerId !== event.pointerId) return
		const next = { ...session.startViewport }
		if (session.direction !== 'height') {
			next.width = session.startViewport.width + (event.clientX - session.startX) / session.scale
		}
		if (session.direction !== 'width') {
			next.height = session.startViewport.height + (event.clientY - session.startY) / session.scale
		}
		onResize(next)
	}

	const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (sessionRef.current?.pointerId !== event.pointerId) return
		sessionRef.current = undefined
		setActiveDirection(undefined)
	}

	const resizeWithKeyboard = (
		direction: ResizeDirection,
		event: ReactKeyboardEvent<HTMLButtonElement>,
	) => {
		const step = event.shiftKey ? 50 : 10
		const next = { ...viewport }
		let handled = true
		switch (event.key) {
			case 'ArrowLeft':
				if (direction === 'height') handled = false
				else next.width -= step
				break
			case 'ArrowRight':
				if (direction === 'height') handled = false
				else next.width += step
				break
			case 'ArrowUp':
				if (direction === 'width') handled = false
				else next.height -= step
				break
			case 'ArrowDown':
				if (direction === 'width') handled = false
				else next.height += step
				break
			default:
				handled = false
		}
		if (!handled) return
		event.preventDefault()
		onResize(next)
	}

	return (
		<>
			{(['width', 'height', 'both'] as const).map((direction) => (
				<button
					aria-label={labels[direction]}
					className={`viewport-resize-handle viewport-resize-${direction}`}
					data-active={activeDirection === direction}
					data-viewport-resize={direction}
					key={direction}
					onKeyDown={(event) => resizeWithKeyboard(direction, event)}
					onLostPointerCapture={finishResize}
					onPointerCancel={finishResize}
					onPointerDown={(event) => beginResize(direction, event)}
					onPointerMove={moveResize}
					onPointerUp={finishResize}
					title={labels[direction]}
					type="button"
				/>
			))}
		</>
	)
}
