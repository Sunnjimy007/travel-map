interface SignInProps {
  onSignIn: () => void
}

export function SignIn({ onSignIn }: SignInProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-ink text-ground">
      <div className="text-center">
        <div className="mx-auto mb-4 h-3.5 w-3.5 bg-sage" />
        <h1 className="mb-2 text-[42px] font-extrabold tracking-[-.015em]">Post Mark</h1>
        <p className="mb-8 text-ground/60">A personal map of the places you've gone.</p>
        <button
          onClick={onSignIn}
          className="bg-coral px-6 py-3 text-[13px] font-extrabold text-white hover:bg-coral-pressed"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
