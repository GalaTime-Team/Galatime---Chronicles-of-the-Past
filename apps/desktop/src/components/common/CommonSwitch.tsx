import React, { useState, useEffect } from 'react';

interface CommonSwitchProps {
    /** The title displayed above the switch */
    title: string;
    /** Optional description displayed below the switch */
    description?: string;
    /** Initial state of the switch */
    defaultChecked?: boolean;
    /** Callback function called when the state changes */
    onChange: (checked: boolean) => void;
    /** Custom class for the main container */
    containerClassName?: string;
    /** Custom class for the title text */
    titleClassName?: string;
    /** Custom class for the switch icon */
    switchClassName?: string;
    /** Custom class for the description text */
    descriptionClassName?: string;
}

const CommonSwitch: React.FC<CommonSwitchProps> = ({
    title,
    description,
    defaultChecked = false,
    onChange,
    containerClassName = '',
    titleClassName = '',
    switchClassName = '',
    descriptionClassName = '',
}) => {
    const [isChecked, setIsChecked] = useState(defaultChecked);

    const handleToggle = () => {
        const newState = !isChecked;
        setIsChecked(newState);
        onChange(newState);
    };

    return (
        <div className={`flex flex-col items-center select-none ${containerClassName}`}>
            {/* Title Section — added explicit text-xl (adjust to your design) */}
            <h2 className={`text-white text-center text-xl ${titleClassName}`}>
                {title}
            </h2>

            {/* Switch Toggle — added matching text-2xl so 0.85em references the same size */}
            <button
                onClick={handleToggle}
                className={`mt-3 text-2xl focus:outline-none hover:scale-105 active:scale-95 transition-transform duration-150 ${switchClassName}`}
                aria-label={`Toggle ${title} ${isChecked ? 'off' : 'on'}`}
            >
                <img
                    src={isChecked ? '/images/ui/switch/switch_on.png' : '/images/ui/switch/switch_off.png'}
                    alt={isChecked ? 'ON' : 'OFF'}
                    className="h-[0.55em] w-auto block"
                />
            </button>

            {/* Description Section */}
            {description && (
                <div className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                    {description}
                </div>
            )}
        </div>
    );
};

export default CommonSwitch;
