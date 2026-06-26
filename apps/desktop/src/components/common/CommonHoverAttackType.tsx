interface CommonHoverAttackTypeProps {
    typeName: string;
    typeIconPath: string;
    isVisible: boolean;
    className?: string;
}
const CommonHoverAttackType: React.FC<CommonHoverAttackTypeProps> = ({
    typeName,
    typeIconPath,
    isVisible,
    className = '',
}) => {

    if (!isVisible) return null;


    return (
        <div className={`flex flex-col border-2 border-white bg-galatime-dark z-50 pointer-events-none select-none ${className}`}>
            {/* Header: Name and Main Icon */}
            <div className="flex items-center justify-center gap-2 mx-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    {typeName}
                </h2>
                <img
                    src={typeIconPath}
                    alt={typeName}
                    className="w-5 h-5 pixelated items-center justify-center"
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
        </div>
    );
};

export default CommonHoverAttackType;