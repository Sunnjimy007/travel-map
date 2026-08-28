import { useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import { useTravelData } from './hooks/useTravelData'
import { SignIn } from './components/SignIn'
import { Nav, type ViewName } from './components/Nav'
import { MapView } from './components/MapView'
import { PlaceCard } from './components/PlaceCard'
import { AddVisitForm } from './components/AddVisitForm'
import { TimelineView } from './views/TimelineView'
import { StatsView } from './views/StatsView'
import { TableView } from './views/TableView'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-ink p-8 text-center text-ground">
        <div className="max-w-md">
          <h1 className="mb-3 text-2xl font-extrabold">Supabase isn't configured yet</h1>
          <p className="text-ground/60">
            Copy <code className="bg-ground/10 px-1.5 py-0.5 font-mono">.env.example</code> to{' '}
            <code className="bg-ground/10 px-1.5 py-0.5 font-mono">.env.local</code>, fill in your
            Supabase project URL and anon key, then restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  return <SignedInGate />
}

function SignedInGate() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth()
  const data = useTravelData(user?.id ?? null)

  const [view, setView] = useState<ViewName>('map')
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pendingPick, setPendingPick] = useState<{ lat: number; lng: number } | null>(null)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null)

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center text-ink/60">Loading…</div>
  }

  if (!user) {
    return <SignIn onSignIn={() => signInWithGoogle()} />
  }

  const selectedPlace = data.places.find((p) => p.id === selectedPlaceId) ?? null

  function openPlace(placeId: string, visitId?: string | null) {
    const place = data.places.find((p) => p.id === placeId)
    setSelectedPlaceId(placeId)
    setSelectedVisitId(visitId ?? null)
    if (place) setFlyTo({ lat: place.latitude, lng: place.longitude })
    setView('map')
  }

  async function handleSaveVisit(input: {
    existingPlaceId: string | null
    town: string
    country: string
    latitude: number
    longitude: number
    visited_date: string
    end_date: string | null
    notes: string
    photos: File[]
  }) {
    const place = input.existingPlaceId
      ? data.places.find((p) => p.id === input.existingPlaceId)!
      : await data.findOrCreatePlace(input.town, input.country, input.latitude, input.longitude)

    const visit = await data.addVisit(place.id, {
      visited_date: input.visited_date,
      end_date: input.end_date,
      notes: input.notes,
    })

    if (input.photos.length > 0) {
      await data.addPhotosToVisit(visit.id, input.photos, 0)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ground">
      <Nav active={view} onChange={setView} onSignOut={signOut} />

      <div className="relative flex-1 overflow-hidden pb-12 md:pb-0">
        {view === 'map' && (
          <MapView
            places={data.places}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(id) => openPlace(id)}
            pickMode={pickMode}
            onPickLocation={(lat, lng) => {
              setPendingPick({ lat, lng })
              setPickMode(false)
              setShowAddForm(true)
            }}
            flyToTarget={flyTo}
          />
        )}
        {view === 'timeline' && (
          <TimelineView places={data.places} onSelectVisit={(placeId, visitId) => openPlace(placeId, visitId)} />
        )}
        {view === 'stats' && <StatsView places={data.places} />}
        {view === 'table' && (
          <TableView
            places={data.places}
            onUpdateVisit={data.updateVisit}
            onUpdatePlace={data.updatePlace}
            onDeleteVisit={data.deleteVisit}
            onAddVisit={() => setShowAddForm(true)}
            onAddPhotos={data.addPhotosToVisit}
          />
        )}

        {view === 'map' && (
          <button
            onClick={() => setShowAddForm(true)}
            className="absolute bottom-16 right-3 bg-coral px-[18px] py-[13px] text-left text-[13px] font-extrabold text-white hover:bg-coral-pressed md:bottom-5 md:right-5"
          >
            + Add visit
          </button>
        )}

        {pickMode && (
          <div className="absolute inset-x-0 top-3 flex justify-center sm:top-5">
            <div className="border border-white/20 bg-ink px-4 py-2 text-[13px] text-ground">
              Click the map to drop a pin
            </div>
          </div>
        )}
      </div>

      {showAddForm && (
        <AddVisitForm
          places={data.places}
          pendingPick={pendingPick}
          onStartPickMode={() => setPickMode(true)}
          onClearPick={() => setPendingPick(null)}
          onSave={handleSaveVisit}
          onClose={() => {
            setShowAddForm(false)
            setPendingPick(null)
          }}
        />
      )}

      {selectedPlace && (
        <PlaceCard
          place={selectedPlace}
          initialVisitId={selectedVisitId}
          onClose={() => setSelectedPlaceId(null)}
          onAddVisit={() => {
            setSelectedPlaceId(null)
            setShowAddForm(true)
          }}
          onUpdateVisit={(visitId, updates) => data.updateVisit(visitId, updates)}
          onUpdatePlace={(updates) => data.updatePlace(selectedPlace.id, updates)}
          onDeleteVisit={(visitId) => data.deleteVisit(visitId)}
          onAddPhotos={(visitId, files, startOrder) => data.addPhotosToVisit(visitId, files, startOrder)}
          onDeletePhoto={(photo) => data.deletePhoto(photo)}
        />
      )}

      {data.error && (
        <div className="absolute bottom-16 left-4 bg-coral/10 px-3 py-2 text-sm text-coral-pressed md:bottom-4">
          {data.error}
        </div>
      )}
    </div>
  )
}
