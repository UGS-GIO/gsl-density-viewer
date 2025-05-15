import { cn } from '@/lib/utils';
import React, { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from "@/components/ui/slider"; // Import Shadcn Slider

interface TimeControlsProps {
    playing: boolean;
    setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    currentTimeIndex: number;
    setCurrentTimeIndex: (index: number) => void;
    timePoints: string[];
    currentTimePoint: string;
    isLoading: boolean;
}

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
        const step = Math.max(1, Math.floor(sortedYears.length / 6)) || 1;

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

    const handleSliderValueChange = useCallback((value: number[]) => {
        const newIndex = value[0];
        if (newIndex !== undefined && newIndex >= 0 && newIndex < timePoints.length) {
            setCurrentTimeIndex(newIndex);
            if (playing) {
                setPlaying(false);
            }
        }
    }, [timePoints, setCurrentTimeIndex, playing, setPlaying]);

    return (
        <div className="mt-4 select-none">
            <div className="flex justify-between items-center mb-5 px-2">
                <Button
                    variant={playing && !playPauseButtonDisabled ? 'destructive' : 'default'}
                    onClick={togglePlay}
                    disabled={playPauseButtonDisabled}
                    // Removed explicit size/font classes, rely on Button variant or add 'size' prop if needed
                    className={cn(
                        "transition-colors duration-150 ease-in-out shadow-sm",
                        // No need for explicit focus-visible here if using Shadcn Button, it has its own
                    )}
                    aria-pressed={playing}
                    aria-label={playing ? "Pause animation" : "Play animation"}
                >
                    {playing ? 'Pause' : 'Play Animation'}
                </Button>

                <div
                    className="text-sm font-medium text-foreground bg-muted py-1.5 px-3 rounded-md shadow-inner whitespace-nowrap min-w-[160px] text-center"
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
                            className="absolute bottom-0 text-xs text-muted-foreground transform -translate-x-1/2 text-center cursor-default"
                            style={{ left: `${positionPercent}%` }}
                        >
                            {year}
                        </div>
                    );
                })}
            </div>

            <div className="px-2 mb-1">
                <Slider
                    value={[currentTimeIndex]}
                    min={0}
                    max={timePoints.length > 0 ? timePoints.length - 1 : 0}
                    step={1}
                    onValueChange={handleSliderValueChange}
                    disabled={sliderDisabled}
                    className={cn("w-full data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed")}
                    aria-valuetext={`Time point: ${formatTimePointForDisplay(currentTimePoint)}`}
                    aria-label="Time Point Slider"
                    aria-controls="time-display-below-slider"
                />
            </div>

            <div
                id="time-display-below-slider"
                className="text-center text-xs text-muted-foreground mt-0 h-5"
                aria-live="polite"
            >
                {timePoints.length > 0 && formatTimePointForDisplay(currentTimePoint)}
            </div>
        </div>
    );
};

export default TimeControls;