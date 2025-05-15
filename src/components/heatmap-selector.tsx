// Assuming this component might be in its own file, e.g., src/components/ui/VariableSelector.tsx
// Or you can keep it inline in GreatSaltLakeHeatmap.tsx and adjust imports.

import React, { Dispatch, SetStateAction } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { VariableKey } from '@/lib/loaders';
import { VariableConfig } from '@/components/map/heatmap-renderer';

// Props for the VariableSelector component
interface VariableSelectorProps {
    variables: VariableKey[];
    selectedVar: VariableKey;
    onChange: Dispatch<SetStateAction<VariableKey>>;
    isLoading: boolean;
    variableConfig: Record<string, VariableConfig | undefined>;
}

const VariableSelector: React.FC<VariableSelectorProps> = ({
    variables,
    selectedVar,
    onChange,
    isLoading,
    variableConfig,
}) => {
    const isDisabled = isLoading || !variables || variables.length <= 1;

    return (
        <div className="mb-4 flex items-center justify-center gap-x-2 sm:gap-x-3">
            <Label htmlFor="variable-select" className="text-sm font-medium text-foreground whitespace-nowrap">
                Show:
            </Label>
            <Select
                value={selectedVar}
                onValueChange={(value: string) => {
                    // The value from Shadcn's Select onValueChange is a string.
                    // We cast it to VariableKey, assuming Item values are valid VariableKeys.
                    onChange(value as VariableKey);
                }}
                disabled={isDisabled}
            >
                <SelectTrigger
                    id="variable-select"
                    className="w-[180px] sm:w-[220px] text-sm py-1.5 h-auto data-[disabled]:opacity-70" // Adjusted class for better height & disabled state
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

export default VariableSelector;