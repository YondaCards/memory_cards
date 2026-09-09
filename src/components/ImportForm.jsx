import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { parseImportFile } from '../lib/parseImport'

export function ImportForm({ deckId, onImported }) {
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)

  async function handleFileChange(event) {
    const file = event.target.files[0]
    if (!file) {
      return
    }
    setError(null)
    setStatus(null)

    try {
      const text = await file.text()
      const parsedCards = parseImportFile(text, file.name)
      if (parsedCards.length === 0) {
        setError('No cards found in file')
        return
      }
      const rows = parsedCards.map((card) => ({
        deck_id: deckId,
        front: card.front,
        back: card.back,
      }))
      const { error: insertError } = await supabase.from('cards').insert(rows)
      if (insertError) {
        setError(insertError.message)
        return
      }
      setStatus(`Imported ${rows.length} cards`)
      onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="import-form">
      <label>
        Import CSV/JSON
        <input type="file" accept=".csv,.json" onChange={handleFileChange} />
      </label>
      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
