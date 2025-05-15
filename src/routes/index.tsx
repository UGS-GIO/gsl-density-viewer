import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import GreatSaltLakeHeatmap from '@/components/map/great-salt-lake-heatmap'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="App bg-white min-h-screen">
      <main className="container mx-auto px-4 pt-6">
        <GreatSaltLakeHeatmap />
      </main>
    </div>
  )
}
