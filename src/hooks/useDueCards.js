import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useDueCards(userId, deckId) {
  const [dueCards, setDueCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let deckIds
    if (deckId) {
      deckIds = [deckId]
    } else {
      const { data: decks, error: decksError } = await supabase
        .from('decks')
        .select('id')
        .eq('owner_id', userId)
      if (decksError) {
        setError(decksError.message)
        setLoading(false)
        return
      }
      deckIds = decks.map((deck) => deck.id)
    }

    if (deckIds.length === 0) {
      setDueCards([])
      setLoading(false)
      return
    }

    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
    if (cardsError) {
      setError(cardsError.message)
      setLoading(false)
      return
    }

    const cardIds = cards.map((card) => card.id)
    const { data: progressRows, error: progressError } = cardIds.length
      ? await supabase.from('card_progress').select('*').eq('user_id', userId).in('card_id', cardIds)
      : { data: [], error: null }
    if (progressError) {
      setError(progressError.message)
      setLoading(false)
      return
    }

    const progressByCardId = new Map(progressRows.map((row) => [row.card_id, row]))
    const today = new Date().toISOString().slice(0, 10)

    const due = cards
      .map((card) => ({ card, progress: progressByCardId.get(card.id) ?? null }))
      .filter(({ progress }) => !progress || progress.due_date <= today)

    setDueCards(due)
    setLoading(false)
  }, [userId, deckId])

  useEffect(() => {
    load()
  }, [load])

  return { dueCards, loading, error, reload: load }
}
