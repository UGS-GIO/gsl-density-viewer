import { createFileRoute } from '@tanstack/react-router';
import GreatSaltLakeHeatmap from '@/components/map/great-salt-lake-heatmap';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (

    <div className="App bg-background text-foreground min-h-screen">
      <main className="container mx-auto px-4 pt-6">
        <GreatSaltLakeHeatmap />
      </main>
    </div>
  );
}