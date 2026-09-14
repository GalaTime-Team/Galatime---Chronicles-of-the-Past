import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx } from '../../controllers/audioController';
import { SwitchIcon } from '../../assets/GalatimeIcon';

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
    /** Orientation of the switch, either 'horizontal' or 'vertical' */
    orientation?: 'horizontal' | 'vertical';
    /** Whether to show the description or not */
    showDescription?: boolean;
    /** Whether the switch is disabled */
    disabled?: boolean;
}

const CommonSwitch: React.FC<CommonSwitchProps> = ({
    title,
    description,
    defaultChecked = false,
    onChange,
    orientation = 'horizontal',
    containerClassName = '',
    titleClassName = '',
    switchClassName = '',
    descriptionClassName = '',
    showDescription = false,
    disabled = false,
}) => {
    const { t } = useTranslation('common');
    const [isChecked, setIsChecked] = useState(defaultChecked);
    const isHorizontal = orientation === 'horizontal';

    const handleToggle = () => {
        if (disabled) return;
        const newState = !isChecked;
        setIsChecked(newState);
        onChange(newState);
    };

    const handleMouseEnter = () => {
        if (!disabled) playSfx('button_sfx');
    };

    return (
        <div
            className={`select-none ${isHorizontal
                ? 'flex flex-row items-center justify-between w-full'
                : 'flex flex-col items-center'
                } ${containerClassName}`}
        >
            {/* Title Section */}
            <h2
                className={`text-center ${isHorizontal ? 'text-lg text-white' : 'text-white/70 text-2xl'
                    } ${titleClassName}`}
            >
                {title}
            </h2>

            {/* Switch + Description wrapper */}
            <div className={`group relative flex flex-col items-center ${isHorizontal ? '' : 'mt-3'}`}>
                {/* Switch Toggle */}
                <button
                    onClick={handleToggle}
                    onMouseEnter={handleMouseEnter}
                    disabled={disabled}
                    className={`text-2xl focus:outline-none hover:scale-105 active:scale-95 transition-all duration-150 ${disabled
                        ? 'text-white/15 cursor-not-allowed'
                        : 'text-white/70 cursor-pointer hover:text-white'
                        } ${switchClassName}`}
                    aria-label={`${t('switch.toggle')} ${title} ${isChecked ? t('switch.off') : t('switch.on')}`}
                >
                    <SwitchIcon checked={isChecked} />
                </button>

                {/* Description Section */}
                {showDescription && description && (
                    isHorizontal ? (
                        <div
                            className={`absolute top-full z-10 mt-1 text-galatime-accent text-xs text-center max-w-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${descriptionClassName}`}
                        >
                            {description}
                        </div>
                    ) : (
                        <div className={`mt-1 text-galatime-accent text-xs text-center max-w-xs ${descriptionClassName}`}>
                            {description}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default CommonSwitch;
