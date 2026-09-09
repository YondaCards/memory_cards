import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { NavBar } from './components/NavBar'
import { Login } from './routes/Login'
import { Decks } from './routes/Decks'
import { DeckDetail } from './routes/DeckDetail'
import { Study } from './routes/Study'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <NavBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/decks" element={<Decks />} />
            <Route path="/decks/:deckId" element={<DeckDetail />} />
            <Route path="/study" element={<Study />} />
            <Route path="/study/:deckId" element={<Study />} />
          </Route>
          <Route path="*" element={<Navigate to="/decks" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
