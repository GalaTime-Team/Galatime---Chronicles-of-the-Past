import React from 'react';

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
    // Base styles — slower transition, scale down on click
    const baseStyles = "relative inline-flex items-center justify-center uppercase tracking-widest transition-all duration-300 ease-out active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none rounded-none border-4 leading-none";

    // Variant styles — borders now transition with hover for smoothness
    const variants: Record<ButtonVariant, string> = {
        primary: "bg-galatime-primary border-galatime-primary text-white hover:bg-galatime-primaryHover hover:border-galatime-primaryHover",
        outline: "bg-transparent border-white/30 text-white hover:bg-white/10 hover:border-white/70",
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