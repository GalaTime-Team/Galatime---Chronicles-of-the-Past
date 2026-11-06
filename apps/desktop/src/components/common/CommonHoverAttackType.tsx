import CommonImage from './CommonImage';
import CommonTooltipCard from './CommonTooltipCard';

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
        <CommonTooltipCard className={`flex flex-col z-50 ${className}`}>
            {/* Header: Name and Main Icon */}
            <div className="flex items-center justify-center gap-2 mx-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                    {typeName}
                </h2>
                <CommonImage
                    src={typeIconPath}
                    alt={typeName}
                    className="w-5 h-5 items-center justify-center"
                />
            </div>
        </CommonTooltipCard>
    );
};

export default CommonHoverAttackType;