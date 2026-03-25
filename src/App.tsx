import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DevToolsApp from "./app/DevToolsApp";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <DevToolsApp />
  </TooltipProvider>
);

export default App;
