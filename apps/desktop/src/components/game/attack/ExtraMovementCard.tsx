import React from 'react';
import { AppIcon } from '../../../assets/GalatimeIcon';

interface ExtraMovementCardProps {
    iconPath: string;
    title: string;
    onClick?: () => void;
    className?: string;
}

const ExtraMovementCard: React.FC<ExtraMovementCardProps> = ({
    iconPath,
    title,
    onClick,
    className = "",
}) => {

    return (
        <div
            onClick={onClick}
            className={`relative w-auto flex items-center cursor-pointer group transition-colors ${className}`}
        >
            {/* Main Box */}
            <div className="flex flex-row w-full bg-galatime-dark hover:bg-galatime-darkHover border-2 border-white/70 group-hover:border-white text-white/70 group-hover:text-white overflow-hidden items-center p-1 transition-colors">

                {/* Left: Icon */}
                <div className="flex-shrink-0 flex items-center justify-center mr-1">
                    <AppIcon src={iconPath} alt={title} className="w-3 h-3" />
                </div>

                {/* Right: Name */}
                <div className="flex-1 flex items-center text-lg leading-2.5 text-left -translate-y-0.5">
                    {title}
                </div>
            </div>
        </div>
    );
};

export default ExtraMovementCard;