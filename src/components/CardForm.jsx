import { useState } from 'react'
import { supabase } from '../supabaseClient'

export function CardForm({ deckId, onAdded }) {
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) {
      return
    }
    const { error: insertError } = await supabase
      .from('cards')
      .insert({ deck_id: deckId, front: trimmedFront, back: trimmedBack })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setFront('')
    setBack('')
    setError(null)
    onAdded()
  }

  return (
    <form onSubmit={handleSubmit} className="card-form">
      {error && <p className="error">{error}</p>}
      <input
        value={front}
        onChange={(event) => setFront(event.target.value)}
        placeholder="Front (question)"
      />
      <input
        value={back}
        onChange={(event) => setBack(event.target.value)}
        placeholder="Back (answer)"
      />
      <button type="submit">Add card</button>
    </form>
  )
}
