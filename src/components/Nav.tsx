export type ViewName = 'map' | 'timeline' | 'table' | 'stats'

const VIEWS: { key: ViewName; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'table', label: 'Table' },
  { key: 'stats', label: 'Stats' },
]

interface NavProps {
  active: ViewName
  onChange: (v: ViewName) => void
  onSignOut: () => void
}

export function Nav({ active, onChange, onSignOut }: NavProps) {
  return (
    <>
      {/* Desktop top nav */}
      <div className="hidden h-14 shrink-0 items-stretch justify-between border-b-2 border-ink bg-ground md:flex">
        <div className="flex items-center gap-3.5 px-8">
          <div className="h-3.5 w-3.5 bg-sage" />
          <span className="font-sans text-[13px] font-extrabold tracking-[.14em] uppercase">
            Post Mark
          </span>
        </div>
        <div className="flex items-stretch border-l-2 border-ink">
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              onClick={() => onChange(v.key)}
              className={`flex items-center px-[22px] text-[13px] ${i > 0 ? 'border-l border-ink/[.27]' : ''} ${
                active === v.key ? 'bg-sage font-extrabold text-white' : 'font-normal text-ink/60 hover:text-ink'
              }`}
            >
              {v.label}
            </button>
          ))}
          <button
            onClick={onSignOut}
            className="flex items-center border-l border-ink/[.27] px-[22px] text-[13px] font-normal text-ink/40 hover:text-ink/70"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t-2 border-ink bg-ground md:hidden">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`flex-1 py-3.5 text-center text-[14px] tracking-[.02em] ${
              active === v.key ? 'bg-sage font-extrabold text-white' : 'font-normal text-ink/60'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </>
  )
}
