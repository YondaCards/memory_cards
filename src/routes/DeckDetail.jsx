import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { CardForm } from '../components/CardForm'

export function DeckDetail() {
  const { deckId } = useParams()
  const { user } = useAuth()
  const [deck, setDeck] = useState(null)
  const [cards, setCards] = useState([])
  const [error, setError] = useState(null)

  async function load() {
    const [{ data: deckData, error: deckError }, { data: cardData, error: cardError }] =
      await Promise.all([
        supabase.from('decks').select('*').eq('id', deckId).single(),
        supabase.from('cards').select('*').eq('deck_id', deckId).order('created_at', { ascending: true }),
      ])

    if (deckError || cardError) {
      setError((deckError ?? cardError).message)
      return
    }
    setDeck(deckData)
    setCards(cardData)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  async function deleteCard(cardId) {
    const { error: deleteError } = await supabase.from('cards').delete().eq('id', cardId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    load()
  }

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!deck) {
    return <p>Loading…</p>
  }

  const isOwner = deck.owner_id === user.id

  return (
    <div className="deck-detail-page">
      <h1>{deck.name}</h1>
      <p>
        <Link to={`/study/${deck.id}`}>Study this deck</Link>
      </p>

      {isOwner && <CardForm deckId={deck.id} onAdded={load} />}

      {cards.length === 0 && <p>No cards yet.</p>}
      <ul>
        {cards.map((card) => (
          <li key={card.id}>
            <strong>{card.front}</strong> — {card.back}
            {isOwner && <button onClick={() => deleteCard(card.id)}>Delete</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
