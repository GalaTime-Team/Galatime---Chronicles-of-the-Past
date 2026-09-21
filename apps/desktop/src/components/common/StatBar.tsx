import React from 'react';

interface StatBarProps {
    label: string;
    value: number;
    max: number;
}

const StatBar: React.FC<StatBarProps> = ({ label, value, max }) => {
    const percentage = Math.max(0, Math.min(100, (value / max) * 100));

    let barColor = 'bg-galatime-accent';
    if (percentage < 25) {
        barColor = 'bg-galatime-error';
    } else if (percentage < 50) {
        barColor = 'bg-galatime-warning';
    } else if (percentage < 100) {
        barColor = 'bg-galatime-success';
    }

    return (
        <div className="flex items-center gap-4">
            <span className="w-24 text-sm text-white/70 capitalize whitespace-nowrap overflow-hidden text-ellipsis font-custom">
                {label.replace(/_/g, ' ')}
            </span>
            <div className="flex-1 h-2 bg-white/10 overflow-hidden">
                <div
                    className={`h-full transition-all duration-300 ${barColor}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="w-10 text-right text-sm font-custom text-white">
                {value}
            </span>
        </div>
    );
};

export default StatBar;
