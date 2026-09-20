import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CommonButton from './CommonButton';

//region — Types
/** Visual theme of the popup (drives accent colors + default confirm button). */
export type PopupVariant = 'normal' | 'danger' | 'warning' | 'success';
/** Width preset of the dialog. */
export type PopupSize = 'sm' | 'md' | 'lg';
/** Available button styles (mirrors CommonButton variants). */
export type PopupActionVariant = 'primary' | 'danger' | 'success' | 'outline' | 'ghost';

/** Describes a single action button inside the popup. */
export interface CommonPopupAction {
  /** Text displayed on the button. */
  label: string;
  /** What happens when the button is pressed. */
  onPress?: () => void;
  /** Button styling. Defaults to the variant's confirm style (or `outline` for secondary actions). */
  variant?: PopupActionVariant;
  /** Close the popup after the action runs. Default: `true`. */
  autoClose?: boolean;
  /** Disables the button. */
  disabled?: boolean;
  /** Optional test id / key when rendering lists. */
  id?: string;
}

export interface CommonPopupProps {
  /** Controls visibility. */
  open: boolean;

  //region — Content
  /** Main heading. */
  title?: string;
  /** Main body text. Supports rich content (JSX). */
  message?: React.ReactNode;
  /** Extra content rendered below the message. */
  children?: React.ReactNode;
  /** Optional icon/illustration rendered above the title. */
  icon?: React.ReactNode;
  //endregion — Content

  //region — Appearance
  /** Visual theme. Default: `normal`. */
  variant?: PopupVariant;
  /** Width preset. Default: `md`. */
  size?: PopupSize;
  /** Renders action buttons stacked vertically. Default: `false`. */
  verticalActions?: boolean;
  /** Custom class names for fine-grained styling. */
  className?: string;
  overlayClassName?: string;
  titleClassName?: string;
  messageClassName?: string;
  actionsClassName?: string;
  /** Overrides the overlay z-index class. Default: `z-50`. */
  zClassName?: string;
  //endregion — Appearance

  //region — Actions
  /**
   * Shorthand for a confirmation/alert primary button (right side).
   * Use alone for an alert (1 button) or with `cancelAction` for a confirmation (2 buttons).
   */
  confirmAction?: CommonPopupAction;
  /** Shorthand for the secondary/cancel button (left side). */
  cancelAction?: CommonPopupAction;
  /** Full control: explicit list of actions. When provided, overrides `confirmAction`/`cancelAction`. */
  actions?: CommonPopupAction[];
  //endregion — Actions

  //region — Behavior
  /** Called whenever the popup wants to close (backdrop click, Escape, close button, action autoClose). */
  onDismiss?: () => void;
  /** Close when the backdrop is clicked. Default: `true`. */
  closeOnBackdrop?: boolean;
  /** Close when Escape is pressed. Default: `true`. */
  closeOnEscape?: boolean;
  /** Show the top-right close button. Default: `false`. */
  showCloseButton?: boolean;
  /** Auto-dismiss after N milliseconds. Disabled by default. */
  autoCloseMs?: number;
  /** Lock body scroll while open. Default: `true`. */
  lockScroll?: boolean;
  //endregion — Behavior
}
//endregion — Types

//region — Style maps
const VARIANT_STYLES: Record<PopupVariant, { border: string; accent: string; defaultAction: PopupActionVariant }> = {
  normal: { border: 'border-galatime-primary/50', accent: 'text-galatime-accent', defaultAction: 'primary' },
  danger: { border: 'border-galatime-error/60', accent: 'text-galatime-errorHover', defaultAction: 'danger' },
  warning: { border: 'border-galatime-warning/60', accent: 'text-galatime-warning', defaultAction: 'primary' },
  success: { border: 'border-galatime-success/60', accent: 'text-galatime-successHover', defaultAction: 'success' },
};

const SIZE_STYLES: Record<PopupSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};
//endregion — Style maps

export function CommonPopup({
  open,
  title,
  message,
  children,
  icon,
  variant = 'normal',
  size = 'md',
  verticalActions = false,
  className = '',
  overlayClassName = '',
  titleClassName = '',
  messageClassName = '',
  actionsClassName = '',
  zClassName = 'z-50',
  confirmAction,
  cancelAction,
  actions,
  onDismiss,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = false,
  autoCloseMs,
  lockScroll = true,
}: CommonPopupProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const styles = VARIANT_STYLES[variant];

  //region — Resolved actions
  const resolvedActions = useMemo<CommonPopupAction[]>(() => {
    if (actions) return actions;
    const list: CommonPopupAction[] = [];
    if (cancelAction) list.push(cancelAction);
    if (confirmAction) list.push(confirmAction);
    return list;
  }, [actions, cancelAction, confirmAction]);

  const handleAction = useCallback((action: CommonPopupAction) => {
    action.onPress?.();
    if (action.autoClose !== false) onDismiss?.();
  }, [onDismiss]);
  //endregion — Resolved actions

  //region — Effects
  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeOnEscape, onDismiss]);

  // Optional auto-dismiss timer.
  useEffect(() => {
    if (!open || !autoCloseMs || autoCloseMs <= 0) return;
    const timer = setTimeout(() => onDismiss?.(), autoCloseMs);
    return () => clearTimeout(timer);
  }, [open, autoCloseMs, onDismiss]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open || !lockScroll) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open, lockScroll]);
  //endregion — Effects

  const handleBackdropClick = () => {
    if (closeOnBackdrop) onDismiss?.();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-black/70 p-5 ${overlayClassName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={message ? messageId : undefined}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            className={`relative w-full border bg-galatime-dark p-6 shadow-2xl outline-none ${SIZE_STYLES[size]} ${styles.border} ${className}`}
            initial={{ y: 12, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 12, scale: 0.97 }}
          >
            {showCloseButton && (
              <CommonButton
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 border-2! px-2!"
                aria-label="close"
                onPress={() => onDismiss?.()}
              >
                ×
              </CommonButton>
            )}

            {icon && <div className={`mb-4 flex justify-center text-4xl ${styles.accent}`}>{icon}</div>}

            {title && (
              <h2 id={titleId} className={`text-2xl uppercase tracking-[0.12em] text-white ${titleClassName}`}>{title}</h2>
            )}

            {message && (
              <div id={messageId} className={`mt-4 text-base leading-2.5 text-white/65 ${messageClassName}`}>{message}</div>
            )}

            {children && <div className="mt-4">{children}</div>}

            {resolvedActions.length > 0 && (
              <div className={`mt-6 flex justify-end gap-3 ${verticalActions ? 'flex-col-reverse' : 'flex-row'} ${actionsClassName}`}>
                {resolvedActions.map((action, index) => {
                  const isLast = index === resolvedActions.length - 1;
                  const actionVariant = action.variant ?? (isLast ? styles.defaultAction : 'outline');
                  return (
                    <CommonButton
                      key={action.id ?? `${action.label}-${index}`}
                      variant={actionVariant}
                      size="sm"
                      disabled={action.disabled}
                      className={verticalActions ? 'w-full' : ''}
                      onPress={() => handleAction(action)}
                    >
                      {action.label}
                    </CommonButton>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CommonPopup;
