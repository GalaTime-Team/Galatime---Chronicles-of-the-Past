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
            className={`relative w-auto flex items-center cursor-pointer group transition-transform active:scale-[.98] ${className}`}
        >
            {/* Main Box */}
            <div className="flex flex-row w-full bg-galatime-dark border-2 border-white text-white overflow-hidden items-center p-1">

                {/* Left: Icon */}
                <div className="flex-shrink-0 flex items-center justify-center mr-2">
                    <img
                        src={iconPath}
                        alt={title}
                        className="w-3 h-3 object-contain"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (!target.src.includes('/images/elements/unknown.png')) {
                                target.src = '/images/elements/unknown.png';
                            } else {
                                target.style.display = 'none';
                            }
                        }}
                    />
                </div>

                {/* Right: Name */}
                <div className="flex-1 flex items-center text-lg leading-none text-left -translate-y-0.5">
                    {title}
                </div>
            </div>
        </div>
    );
};

export default ExtraMovementCard;