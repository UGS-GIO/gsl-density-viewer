import { cn } from '@/lib/utils';
import React, { useCallback, useMemo } from 'react';

interface TimeControlsProps {
    playing: boolean;
    setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    currentTimeIndex: number;
    setCurrentTimeIndex: (index: number) => void;
    timePoints: string[]; // Array of strings like "YYYY-MM"
    currentTimePoint: string; // Current timePoint string like "YYYY-MM"
    isLoading: boolean;
}

/**
 * Component for time controls (play/pause, slider) with horizontal year markers,
 * styled with Tailwind CSS.
 */
const TimeControls: React.FC<TimeControlsProps> = ({
    playing,
    setPlaying,
    currentTimeIndex,
    setCurrentTimeIndex,
    timePoints,
    currentTimePoint,
    isLoading,
}) => {
    const togglePlay = useCallback(() => {
        setPlaying((prevPlayingState) => !prevPlayingState);
    }, [setPlaying]);

    const handleSliderChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const newIndex = parseInt(e.target.value, 10);
            if (newIndex >= 0 && newIndex < timePoints.length) {
                setCurrentTimeIndex(newIndex);
                if (playing) {
                    setPlaying(false);
                }
            }
        },
        [playing, setPlaying, setCurrentTimeIndex, timePoints]
    );

    const handleSliderFinish = useCallback(
        (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
            const target = e.target as HTMLInputElement;
            const newIndex = parseInt(target.value, 10);
            if (newIndex >= 0 && newIndex < timePoints.length) {
                setCurrentTimeIndex(newIndex);
            }
        },
        [setCurrentTimeIndex, timePoints]
    );

    const yearTicks = useMemo(() => {
        if (!timePoints || timePoints.length === 0) return [];
        const years = new Set<string>();
        timePoints.forEach((tp) => {
            if (tp && typeof tp.split === 'function') {
                const year = tp.split('-')[0];
                if (year) years.add(year);
            }
        });

        const sortedYears = Array.from(years).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
        if (sortedYears.length === 0) return [];

        const ticks: string[] = [];
        const step = Math.max(1, Math.floor(sortedYears.length / 6)) || 1; // Aim for ~5-7 ticks

        for (let i = 0; i < sortedYears.length; i += step) {
            ticks.push(sortedYears[i]);
        }
        if (sortedYears.length > 0 && !ticks.includes(sortedYears[0])) {
            ticks.unshift(sortedYears[0]);
        }
        const lastYear = sortedYears[sortedYears.length - 1];
        if (lastYear && !ticks.includes(lastYear)) {
            ticks.push(lastYear);
        }
        return Array.from(new Set(ticks)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [timePoints]);

    const formatTimePointForDisplay = useCallback((timePoint: string): string => {
        if (!timePoint || typeof timePoint.split !== 'function') return 'Invalid Date';
        const parts = timePoint.split('-');
        if (parts.length < 2) return 'Invalid Date';
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        if (isNaN(year) || isNaN(month)) return 'Invalid Date';
        try {
            return new Date(year, month - 1).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
            });
        } catch (e) {
            return 'Invalid Date';
        }
    }, []);

    const playPauseButtonDisabled = isLoading || !timePoints || timePoints.length <= 1;
    const sliderDisabled = isLoading || !timePoints || timePoints.length <= 1;

    return (
        <div className="mt-4 select-none">
            <div className="flex justify-between items-center mb-5 px-2">
                <button
                    onClick={togglePlay}
                    disabled={playPauseButtonDisabled}
                    className={`py-2 px-4 rounded-lg font-medium text-sm text-white transition-colors duration-200 ease-in-out shadow-md
            ${playing && !playPauseButtonDisabled ? 'bg-red-500 hover:bg-red-600' : ''}
            ${!playing && !playPauseButtonDisabled ? 'bg-blue-600 hover:bg-blue-700' : ''}
            ${playPauseButtonDisabled ? 'bg-gray-400 opacity-60 cursor-not-allowed' : ''}
          `}
                    aria-pressed={playing}
                    aria-label={playing ? "Pause animation" : "Play animation"}
                >
                    {playing ? 'Pause' : 'Play Animation'}
                </button>

                <div
                    className="text-sm font-medium text-gray-700 bg-gray-50 py-1.5 px-3 rounded-md shadow-inner whitespace-nowrap min-w-[160px] text-center"
                    aria-live="polite"
                >
                    {timePoints.length > 0
                        ? `${formatTimePointForDisplay(currentTimePoint)} (${currentTimeIndex + 1}/${timePoints.length})`
                        : isLoading
                            ? 'Loading...'
                            : 'No time data'}
                </div>
            </div>

            <div className="relative h-6 mt-1 mb-1 mx-2">
                {yearTicks.map((year) => {
                    const index = timePoints.findIndex((tp) => tp && tp.startsWith(`${year}-`));
                    if (index === -1 || timePoints.length <= 1) return null;
                    const positionPercent = (index / (timePoints.length - 1)) * 100;
                    return (
                        <div
                            key={year}
                            className="absolute bottom-0 text-xs text-gray-600 transform -translate-x-1/2 text-center cursor-default"
                            style={{ left: `${positionPercent}%` }}
                        >
                            {year}
                        </div>
                    );
                })}
            </div>

            <div className="px-2 mb-1">
                <input
                    type="range"
                    min="0"
                    max={timePoints.length > 0 ? timePoints.length - 1 : 0}
                    value={currentTimeIndex}
                    onChange={handleSliderChange}
                    onMouseUp={handleSliderFinish}
                    onTouchEnd={handleSliderFinish}
                    disabled={sliderDisabled}
                    className={cn(`appearance-none w-full h-2.5 rounded-full outline-none transition-opacity duration-200 ease-in-out`,
                        sliderDisabled
                            ? 'bg-gray-200 opacity-60 cursor-not-allowed'
                            : 'bg-gray-300 hover:bg-gray-400 cursor-pointer'
                    )}
                    // For custom thumb styling, you'd typically need custom CSS:
                    // e.g., in your global CSS:
                    // input[type=range]::-webkit-slider-thumb { /* ... styles ... */}
                    // input[type=range]::-moz-range-thumb { /* ... styles ... */}
                    aria-valuetext={`Time point: ${formatTimePointForDisplay(currentTimePoint)}`}
                    aria-label="Time Point Slider"
                    aria-controls="time-display-below-slider"
                />
            </div>

            <div
                id="time-display-below-slider"
                className="text-center text-xs text-gray-600 mt-0 h-5"
                aria-live="polite"
            >
                {timePoints.length > 0 && formatTimePointForDisplay(currentTimePoint)}
            </div>
        </div>
    );
};

export default TimeControls;