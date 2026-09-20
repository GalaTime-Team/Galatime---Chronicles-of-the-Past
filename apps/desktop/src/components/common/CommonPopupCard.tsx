import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, steps } from "framer-motion";

import { Loading } from '../../assets/GalatimeIcon';

export type PopupMode = 'normal' | 'danger' | 'warning' | 'success';

/** Screen corner the card slides in from. */
export type PopupPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Animation applied to the icon slot. `'music'` gives a snappy, stepped bounce. */
export type PopupIconAnimation = 'none' | 'music';

export interface CommonPopupCardProps {
    isOpen: boolean;
    message: string;
    /** Optional label rendered above the message, in the mode's accent tone. */
    title?: string;
    /** Optional secondary line rendered below the message. */
    subtitle?: string;
    mode?: PopupMode;
    autoCloseTime?: number;
    onClose?: () => void;
    onClick?: () => void;
    showLoading?: boolean;
    /** Replaces the loading spinner with a custom glyph, e.g. a music note. */
    icon?: React.ReactNode;
    /** Animation style for the icon slot. Default: `'none'`. */
    iconAnimation?: PopupIconAnimation;
    /** Corner the card lives in. Default: `bottom-right`. */
    position?: PopupPosition;
    /** Extra classes for the card surface. */
    className?: string;
}

/** Placement classes per corner, so a card can live anywhere without touching the layout. */
const POSITION_CLASSES: Record<PopupPosition, string> = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
};

/**
 * Horizontal distance, in px, the card travels while entering and leaving. The animation is
 * deliberately one-dimensional: the card slides sideways from its own edge of the screen and
 * never drifts vertically, so `top-*` and `bottom-*` only decide where it rests.
 */
const SLIDE_DISTANCE = 48;

/** Signed offset per corner: negative slides in from the left, positive from the right. */
const POSITION_OFFSETS: Record<PopupPosition, number> = {
    'top-left': -SLIDE_DISTANCE,
    'bottom-left': -SLIDE_DISTANCE,
    'top-right': SLIDE_DISTANCE,
    'bottom-right': SLIDE_DISTANCE,
};

/** Surface, outline, accent and stripe tones of each mode. */
const MODE_STYLES: Record<PopupMode, { surface: string; accent: string; stripe: string; text: string }> = {
    normal: { surface: 'bg-galatime-dark/95 outline-galatime-primary/60', accent: 'text-galatime-accent', stripe: 'bg-galatime-primary', text: 'text-white' },
    danger: { surface: 'bg-galatime-error/95 outline-galatime-errorHover', accent: 'text-white', stripe: 'bg-galatime-errorHover', text: 'text-white' },
    warning: { surface: 'bg-galatime-warning/95 outline-galatime-warningHover', accent: 'text-galatime-dark', stripe: 'bg-galatime-warningHover', text: 'text-galatime-dark' },
    success: { surface: 'bg-galatime-success/95 outline-galatime-successHover', accent: 'text-white', stripe: 'bg-galatime-successHover', text: 'text-white' },
};

/** Fallback note used when `iconAnimation="music"` but no custom icon was passed. */
const MusicNoteIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={className}
        aria-hidden="true"
    >
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
        <circle cx="18" cy="16" r="3" fill="currentColor" stroke="none" />
    </svg>
);

const CommonPopupCard: React.FC<CommonPopupCardProps> = ({
    isOpen,
    message,
    title,
    subtitle,
    mode = 'normal',
    autoCloseTime = 8000,
    onClose,
    onClick,
    showLoading = true,
    icon,
    iconAnimation = 'none',
    position = 'bottom-right',
    className = '',
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

    const styles = MODE_STYLES[mode];
    const offsetX = POSITION_OFFSETS[position];

    /**
     * Icon slot content.
     * `'music'` overrides the loading spinner and bounces the icon with `steps()`,
     * so movement snaps between discrete frames — no eased tweens, pixel-game feel.
     */
    const iconContent = iconAnimation === 'music' ? (
        <motion.span
            className="block"
            initial={false}
            animate={{
                y: [0, -4, 0, -2, 0],
                rotate: [0, -12, 0, 10, 0],
            }}
            transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatDelay: 0.4,
                ease: steps(2), // 2 discrete jumps per segment → choppy, "pixel" motion
            }}
        >
            {icon ?? <MusicNoteIcon />}
        </motion.span>
    ) : (
        icon ?? (showLoading ? <Loading imageClassName="h-5" /> : null)
    );

    const showIconSlot = iconAnimation === 'music' ? true : Boolean(icon || showLoading);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, x: offsetX, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: offsetX, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    role="status"
                    aria-live="polite"
                    className={`fixed z-50 flex max-w-xs cursor-pointer select-none items-stretch overflow-hidden text-left shadow-lg outline-2 backdrop-blur-sm pointer-events-auto
            ${POSITION_CLASSES[position]}
            ${styles.surface}
            ${className}
          `}
                    onClick={handleClick}
                >
                    {/* Accent stripe — a coloured spine that reads like a player widget. */}
                    <span aria-hidden="true" className={`w-1 shrink-0 ${styles.stripe}`} />

                    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
                        {showIconSlot && (
                            <span className={`flex shrink-0 items-center justify-center ${styles.accent}`}>
                                {iconContent}
                            </span>
                        )}

                        <div className="flex min-w-0 flex-col leading-tight">
                            {title && (
                                <span className={`text-xs uppercase tracking-[0.2em] ${styles.accent}`}>{title}</span>
                            )}
                            <span className={`truncate text-lg ${styles.text}`}>{message}</span>
                            {subtitle && <span className="text-xs text-white/60">{subtitle}</span>}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CommonPopupCard;