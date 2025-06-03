import { cn } from '@/lib/utils';
import React, { Dispatch, SetStateAction, useCallback, useMemo } from 'react';
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
                    id="time-display-below-slider" // This is actually above the slider now
                    className="text-center text-xl text-muted-foreground mt-0 h-5 mb-6"
                    aria-live="polite"
                >
                    {timePoints.length > 0 && formatTimePointForDisplay(currentTimePoint)}
                </div>

                {/* Slider container  */}
                <div className="px-2 mb-6 mx-2"> {/* Increased bottom margin for space */}
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

                {/* Main controls container for Selector, Date Display, and Play Button */}
                {/* This container will handle stacking on mobile and row layout on desktop */}
                <div className="flex flex-col lg:flex-row lg:justify-around lg:items-center gap-4 px-2">

                    {/* Heatmap Selector */}
                    {variables.length > 0 && !isLoading && (
                        <div className="w-full lg:w-auto flex justify-center">
                            <HeatmapSelector
                                variables={variables}
                                selectedVar={selectedVar}
                                onChange={onChange}
                                isLoading={isLoading}
                                variableConfig={variableConfig}
                            />
                        </div>
                    )}

                    {/* Play Button - Moved to be in the middle for desktop by source order */}
                    <div className="flex justify-center w-full lg:w-auto">
                        <Button
                            variant={playing && !playPauseButtonDisabled ? 'destructive' : 'default'}
                            onClick={togglePlay}
                            disabled={playPauseButtonDisabled}
                            className={cn(
                                "transition-colors duration-150 ease-in-out shadow-sm",
                            )}
                            aria-pressed={playing}
                            aria-label={playing ? "Pause animation" : "Play animation"}
                        >
                            {playing ? 'Pause' : 'Play Animation'}
                        </Button>
                    </div>

                    {/* Date Display */}
                    <div
                        className={cn(
                            "text-sm font-medium text-foreground bg-muted py-1.5 px-3 rounded-md shadow-inner whitespace-nowrap text-center",
                            "w-full lg:w-auto min-w-[160px]",
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