import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolFaqSection } from "@/components/tools/ToolFaq";
import { useColorStudio } from "@/hooks/useColorStudio";
import { useRecentColors } from "@/hooks/useRecentColors";
import { toCssColor, type Color, type PaletteMode } from "@/utils/color";
import { ColorWorkspace } from "./color-palette/ColorWorkspace";
import { ContrastPanel } from "./color-palette/ContrastPanel";
import { PalettePanel } from "./color-palette/PalettePanel";
import { VisionPanel } from "./color-palette/VisionPanel";
import { DEFAULT_COMPARE } from "./color-palette/shared";
import { FAQ_ITEMS } from "./color-palette/faq";

export function ColorPalette() {
  const recents = useRecentColors();
  const studio = useColorStudio({ onCommit: recents.add });
  const [fg, setFg] = useState("#777777");
  const [bg, setBg] = useState("#ffffff");
  const [compareText, setCompareText] = useState(DEFAULT_COMPARE);
  const [mode, setMode] = useState<PaletteMode>("tints");

  const usePaletteForComparison = (colors: Color[]) => {
    setCompareText(colors.map(toCssColor).join(", "));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <ColorWorkspace studio={studio} recents={recents.colors} onApplyRecent={studio.applyColor} />
        <Tabs defaultValue="palette">
          <TabsList aria-label="Color tools" className="w-full sm:w-auto">
            <TabsTrigger value="palette" className="flex-1 sm:flex-none">
              Palette
            </TabsTrigger>
            <TabsTrigger value="contrast" className="flex-1 sm:flex-none">
              Contrast
            </TabsTrigger>
            <TabsTrigger value="vision" className="flex-1 sm:flex-none">
              Vision
            </TabsTrigger>
          </TabsList>
          <TabsContent value="palette" forceMount className="data-[state=inactive]:hidden">
            <PalettePanel
              color={studio.color}
              mode={mode}
              onModeChange={setMode}
              onApply={studio.applyColor}
              onUseForComparison={usePaletteForComparison}
            />
          </TabsContent>
          <TabsContent value="contrast" forceMount className="data-[state=inactive]:hidden">
            <ContrastPanel
              fg={fg}
              bg={bg}
              setFg={setFg}
              setBg={setBg}
              workingColor={studio.color}
              onApplySuggested={recents.add}
            />
          </TabsContent>
          <TabsContent value="vision" forceMount className="data-[state=inactive]:hidden">
            <VisionPanel color={studio.color} compareText={compareText} setCompareText={setCompareText} />
          </TabsContent>
        </Tabs>
      </div>
      <ToolFaqSection items={FAQ_ITEMS} />
    </div>
  );
}
