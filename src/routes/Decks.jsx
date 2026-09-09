import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export function Decks() {
  const { user } = useAuth()
  const [ownDecks, setOwnDecks] = useState([])
  const [publicDecks, setPublicDecks] = useState([])
  const [newDeckName, setNewDeckName] = useState('')
  const [error, setError] = useState(null)

  async function loadDecks() {
    setError(null)
    const [{ data: own, error: ownError }, { data: pub, error: pubError }] = await Promise.all([
      supabase
        .from('decks')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('decks')
        .select('*')
        .eq('is_public', true)
        .neq('owner_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (ownError || pubError) {
      setError((ownError ?? pubError).message)
      return
    }
    setOwnDecks(own)
    setPublicDecks(pub)
  }

  useEffect(() => {
    loadDecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function createDeck(event) {
    event.preventDefault()
    const name = newDeckName.trim()
    if (!name) {
      return
    }
    const { error: insertError } = await supabase.from('decks').insert({ name, owner_id: user.id })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewDeckName('')
    loadDecks()
  }

  async function togglePublic(deck) {
    const { error: updateError } = await supabase
      .from('decks')
      .update({ is_public: !deck.is_public })
      .eq('id', deck.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    loadDecks()
  }

  async function deleteDeck(deck) {
    if (!window.confirm(`Delete deck "${deck.name}"? This deletes all its cards too.`)) {
      return
    }
    const { error: deleteError } = await supabase.from('decks').delete().eq('id', deck.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadDecks()
  }

  return (
    <div className="decks-page">
      {error && <p className="error">{error}</p>}

      <form onSubmit={createDeck}>
        <input
          value={newDeckName}
          onChange={(event) => setNewDeckName(event.target.value)}
          placeholder="New deck name"
        />
        <button type="submit">Create deck</button>
      </form>

      <h2>My decks</h2>
      {ownDecks.length === 0 && <p>No decks yet — create one above.</p>}
      <ul>
        {ownDecks.map((deck) => (
          <li key={deck.id}>
            <Link to={`/decks/${deck.id}`}>{deck.name}</Link>{' '}
            <Link to={`/study/${deck.id}`}>Study</Link>{' '}
            <label>
              <input
                type="checkbox"
                checked={deck.is_public}
                onChange={() => togglePublic(deck)}
              />
              Public
            </label>{' '}
            <button className="danger" onClick={() => deleteDeck(deck)}>Delete</button>
          </li>
        ))}
      </ul>

      <h2>Public decks from other users</h2>
      {publicDecks.length === 0 && <p>No public decks yet.</p>}
      <ul>
        {publicDecks.map((deck) => (
          <li key={deck.id}>
            <Link to={`/decks/${deck.id}`}>{deck.name}</Link>{' '}
            <Link to={`/study/${deck.id}`}>Study</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
