import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { user, loading, signInWithGoogle } = useAuth()

  if (loading) {
    return <p>Loading…</p>
  }
  if (user) {
    return <Navigate to="/decks" replace />
  }

  return (
    <div className="login-page">
      <h1>Flashcards</h1>
      <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
    </div>
  )
}
