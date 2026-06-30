import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from "framer-motion";

import CommonLoading from './CommonLoading';

export type PopupMode = 'normal' | 'danger' | 'warning' | 'success';

export interface CommonPopupCardProps {
	isOpen: boolean;
	message: string;
	mode?: PopupMode;
	autoCloseTime?: number;
	onClose?: () => void;
	onClick?: () => void;
	showLoading?: boolean;
}

const CommonPopupCard: React.FC<CommonPopupCardProps> = ({
	isOpen,
	message,
	mode = 'normal',
	autoCloseTime = 8000,
	onClose,
	onClick,
	showLoading = true,
}) => {
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	const handleClose = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		onClose?.();
	}, [onClose]);

	const handleClick = useCallback(() => {
		onClick?.();          // fire separate click handler first
		handleClose();        // then close
	}, [onClick, handleClose]);

	useEffect(() => {
		if (isOpen && autoCloseTime > 0) {
			timerRef.current = setTimeout(handleClose, autoCloseTime);
		}
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [isOpen, autoCloseTime, handleClose]);

	const modeClasses: Record<PopupMode, string> = {
		normal: 'bg-galatime-dark outline-white outline-3 outline',
		danger: 'bg-galatime-error outline-galatime-error outline-3 outline',
		warning: 'bg-galatime-warning outline-galatime-warning outline-3 outline',
		success: 'bg-galatime-success outline-galatime-success outline-3 outline',
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0, x: 50, scale: 0.95 }}
					animate={{ opacity: 1, x: 0, scale: 1 }}
					exit={{ opacity: 0, x: 50, scale: 0.95 }}
					transition={{ type: 'spring', stiffness: 400, damping: 25 }}
					className={`fixed bottom-4 right-4 z-50 flex items-center text-white cursor-pointer pointer-events-auto shadow-lg
            ${modeClasses[mode]}
          `}
					onClick={handleClick}
				>
					<div className="flex items-center justify-center gap-4 m-2">
						{showLoading && <CommonLoading imageClassName="h-5 " />}
						<span className="leading-none">{message}</span>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
};

export default CommonPopupCard;
