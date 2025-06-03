import React, { Dispatch, SetStateAction } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { VariableKey } from '@/lib/loaders';
import { VariableConfig } from '@/components/map/heatmap-renderer';

interface HeatmapSelectorProps {
    variables: VariableKey[];
    selectedVar: VariableKey;
    onChange: Dispatch<SetStateAction<VariableKey>>;
    isLoading: boolean;
    variableConfig: Record<string, VariableConfig | undefined>;
}

const HeatmapSelector: React.FC<HeatmapSelectorProps> = ({
    variables,
    selectedVar,
    onChange,
    isLoading,
    variableConfig,
}) => {
    const isDisabled = isLoading || !variables || variables.length <= 1;

    return (
        <div className="flex items-center justify-center gap-x-2 sm:gap-x-3">
            <Select
                value={selectedVar}
                onValueChange={(value: string) => {
                    onChange(value as VariableKey);
                }}
                disabled={isDisabled}
            >
                <SelectTrigger
                    id="variable-select"
                    className="min-w-xs max-w-2xl text-sm py-1.5 h-auto data-[disabled]:opacity-70"
                >
                    <SelectValue placeholder="Select variable..." />
                </SelectTrigger>
                <SelectContent>
                    {variables.map((variableKey) => {
                        const config = variableConfig[variableKey];
                        const label = config?.label || variableKey;
                        const unit = config?.unit ? ` (${config.unit})` : '';
                        return (
                            <SelectItem key={variableKey} value={variableKey} className="text-sm">
                                {label}{unit}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>
        </div>
    );
};

export default HeatmapSelector;