import React from 'react';
import { playSfx } from '../../controllers/audioController';

type ButtonVariant = 'primary' | 'danger' | 'success' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    onPress?: () => void;
    className?: string;
    children: React.ReactNode;
}

const CommonButton: React.FC<CommonButtonProps> = ({
    variant = 'primary',
    size = 'md',
    type = 'button',
    onPress,
    className = '',
    children,
    disabled,
    ...props
}) => {
    const handleMouseEnter = () => {
        playSfx('button_sfx');
    };
    // Base styles — color-based transitions on hover/active
    const baseStyles = "relative inline-flex items-center justify-center uppercase tracking-widest transition-colors duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-none border-4 leading-none";

    // Variant styles — colors transition with hover for smoothness
    const variants: Record<ButtonVariant, string> = {
        primary: "bg-galatime-primary border-galatime-primary text-white hover:bg-galatime-primaryHover hover:border-galatime-primaryHover",
        outline: "bg-transparent border-white/30 text-white/70 hover:bg-white hover:border-white hover:text-galatime-dark",
        danger: "bg-galatime-error border-galatime-error text-white hover:bg-galatime-errorHover hover:border-galatime-errorHover",
        success: "bg-galatime-success border-galatime-success text-white hover:bg-galatime-successHover hover:border-galatime-successHover",
    };

    // Size styles — tighter vertical padding
    const sizes: Record<ButtonSize, string> = {
        sm: "px-2 py-0 text-xs",
        md: "px-3 py-0.5 text-sm",
        lg: "px-5 py-1 text-base",
    };

    return (
        <button
            type={type}
            onClick={onPress}
            onMouseEnter={handleMouseEnter}
            disabled={disabled}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
            {...props}
        >
            <span className="relative z-10">
                {children}
            </span>
        </button>
    );
};

export default CommonButton;