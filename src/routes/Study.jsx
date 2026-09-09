import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useDueCards } from '../hooks/useDueCards'
import { sm2, DEFAULT_PROGRESS } from '../lib/sm2'

export function Study() {
  const { deckId } = useParams()
  const { user } = useAuth()
  const { dueCards, loading, error } = useDueCards(user.id, deckId)
  const [index, setIndex] = useState(0)
  const [showBack, setShowBack] = useState(false)
  const [saveError, setSaveError] = useState(null)

  if (loading) {
    return <p>Loading…</p>
  }
  if (error) {
    return <p className="error">{error}</p>
  }
  if (dueCards.length === 0) {
    return <p>No cards due. Nice work.</p>
  }
  if (index >= dueCards.length) {
    return <p>Session complete. No more cards due.</p>
  }

  const { card, progress } = dueCards[index]

  async function grade(gradeValue) {
    const previous = progress
      ? {
          easeFactor: Number(progress.ease_factor),
          intervalDays: progress.interval_days,
          repetitions: progress.repetitions,
        }
      : DEFAULT_PROGRESS

    const next = sm2(previous, gradeValue)

    const { error: upsertError } = await supabase.from('card_progress').upsert(
      {
        user_id: user.id,
        card_id: card.id,
        ease_factor: next.easeFactor,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        due_date: next.dueDate,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,card_id' }
    )

    if (upsertError) {
      setSaveError(upsertError.message)
      return
    }

    setShowBack(false)
    setIndex((current) => current + 1)
  }

  return (
    <div className="study-page">
      {saveError && <p className="error">{saveError}</p>}
      <p>
        Card {index + 1} of {dueCards.length}
      </p>
      <div className="study-card">
        <p className="front">{card.front}</p>
        {showBack && <p className="back">{card.back}</p>}
      </div>

      {!showBack ? (
        <button onClick={() => setShowBack(true)}>Show answer</button>
      ) : (
        <div className="grade-buttons">
          <button onClick={() => grade('again')}>Again</button>
          <button onClick={() => grade('hard')}>Hard</button>
          <button onClick={() => grade('good')}>Good</button>
          <button onClick={() => grade('easy')}>Easy</button>
        </div>
      )}
    </div>
  )
}
