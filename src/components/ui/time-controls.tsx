import { cn } from '@/lib/utils';
import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from "@/components/ui/slider";
import { VariableKey } from '@/lib/loaders';
import { VariableConfig } from '@/components/map/heatmap-renderer';
import HeatmapSelector from '@/components/heatmap-selector';

interface TimeControlsProps {
    playing: boolean;
    setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    currentTimeIndex: number;
    setCurrentTimeIndex: (index: number) => void;
    timePoints: string[];
    currentTimePoint: string;
    isLoading: boolean;
    variables: VariableKey[];
    selectedVar: VariableKey;
    onChange: Dispatch<SetStateAction<VariableKey>>;
    variableConfig: Record<string, VariableConfig | undefined>;
}

const TimeControls: React.FC<TimeControlsProps> = ({
    playing,
    setPlaying,
    currentTimeIndex,
    setCurrentTimeIndex,
    timePoints,
    currentTimePoint,
    isLoading,
    variables,
    selectedVar,
    onChange,
    variableConfig,
}) => {
    const togglePlay = useCallback(() => {
        setPlaying((prevPlayingState) => !prevPlayingState);
    }, [setPlaying]);

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
        <div className="my-4 select-none w-full">
            <div>
                <div
                    id="time-display-above-slider"
                    className="text-center text-xl text-muted-foreground mt-0 h-5 mb-6"
                    aria-live="polite"
                >
                    {timePoints.length > 0 && formatTimePointForDisplay(currentTimePoint)}
                </div>

                {/* Slider container */}
                <div className="px-2 mb-1 mx-2">
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
                        aria-controls="time-display-above-slider"
                    />
                </div>

                {/* Container for Play Button, HeatmapSelector, and secondary Date Display. */}
                <div className="flex flex-col md:flex-row md:justify-center md:items-center gap-4 px-2 mt-3">

                    {/* Play Button - Order 1 on mobile (directly under slider), Order 2 on desktop */}
                    <div className="w-full md:w-auto flex justify-center order-1 md:order-2">
                        <Button
                            variant={playing && !playPauseButtonDisabled ? 'destructive' : 'default'}
                            onClick={togglePlay}
                            disabled={playPauseButtonDisabled}
                            className={cn(
                                "transition-colors duration-150 ease-in-out shadow-sm px-6",
                            )}
                            aria-pressed={playing}
                            aria-label={playing ? "Pause animation" : "Play animation"}
                        >
                            {playing ? 'Pause' : 'Play Animation'}
                        </Button>
                    </div>

                    {/* Heatmap Selector - Order 2 on mobile, Order 1 on desktop */}
                    {variables.length > 0 && !isLoading && (
                        <div className="w-full md:w-auto flex justify-center order-2 md:order-1">
                            <HeatmapSelector
                                variables={variables}
                                selectedVar={selectedVar}
                                onChange={onChange}
                                isLoading={isLoading}
                                variableConfig={variableConfig}
                            />
                        </div>
                    )}

                    {/* Date Display (secondary with index/total) - Order 3 on mobile and desktop */}
                    <div
                        className={cn(
                            "text-sm font-medium text-foreground bg-muted py-1.5 px-3 rounded-md shadow-inner whitespace-nowrap text-center order-3 md:order-3",
                            "w-full md:w-auto min-w-[160px]",
                            "hidden sm:block"
                        )}
                        aria-live="polite"
                    >
                        {timePoints.length > 0
                            ? `${formatTimePointForDisplay(currentTimePoint)} (${currentTimeIndex + 1}/${timePoints.length})`
                            : isLoading
                                ? 'Loading...'
                                : 'No time data'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimeControls;