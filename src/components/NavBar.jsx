import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function NavBar() {
  const { user, signOut } = useAuth()

  if (!user) {
    return null
  }

  return (
    <nav className="navbar">
      <Link to="/decks">Decks</Link>
      <Link to="/study">Study all due</Link>
      <span className="navbar-user">{user.user_metadata?.name ?? user.email}</span>
      <button onClick={() => signOut()}>Sign out</button>
    </nav>
  )
}
