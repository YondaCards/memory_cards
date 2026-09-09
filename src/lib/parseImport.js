export function parseImportFile(text, filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) {
    return parseJson(text)
  }
  if (lower.endsWith('.csv')) {
    return parseCsv(text)
  }
  throw new Error('Unsupported file type — use .csv or .json')
}

function parseJson(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error('Invalid JSON file')
  }
  if (!Array.isArray(data)) {
    throw new Error('JSON file must contain an array of {front, back} objects')
  }
  return data.map((entry, index) => {
    if (!entry || typeof entry.front !== 'string' || typeof entry.back !== 'string') {
      throw new Error(`Entry ${index + 1} is missing "front" or "back"`)
    }
    return { front: entry.front.trim(), back: entry.back.trim() }
  })
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const cards = []
  lines.forEach((line, index) => {
    if (index === 0 && line.toLowerCase() === 'front,back') {
      return
    }
    const commaIndex = line.indexOf(',')
    if (commaIndex === -1) {
      throw new Error(`Line ${index + 1} is not in "front,back" format`)
    }
    const front = line.slice(0, commaIndex).trim()
    const back = line.slice(commaIndex + 1).trim()
    if (!front || !back) {
      throw new Error(`Line ${index + 1} is missing a front or back value`)
    }
    cards.push({ front, back })
  })
  return cards
}
