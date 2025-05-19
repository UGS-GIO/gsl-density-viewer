import { createFileRoute } from '@tanstack/react-router';
import GreatSaltLakeHeatmap from '@/components/map/great-salt-lake-heatmap';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (

    <div className="App flex flex-col min-h-screen w-screen overflow-hidden bg-background text-foreground">
      <main className="flex-grow flex flex-col">
        <GreatSaltLakeHeatmap />
      </main>
    </div>
  );
}