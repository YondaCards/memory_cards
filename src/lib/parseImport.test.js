import { describe, it, expect } from 'vitest'
import { parseImportFile } from './parseImport'

describe('parseImportFile', () => {
  it('parses a JSON array of front/back objects', () => {
    const text = '[{"front":"Hello","back":"Bonjour"},{"front":"Dog","back":"Chien"}]'
    expect(parseImportFile(text, 'cards.json')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('parses CSV with a header row', () => {
    const text = 'front,back\nHello,Bonjour\nDog,Chien\n'
    expect(parseImportFile(text, 'cards.csv')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('parses CSV without a header row', () => {
    const text = 'Hello,Bonjour\nDog,Chien'
    expect(parseImportFile(text, 'cards.csv')).toEqual([
      { front: 'Hello', back: 'Bonjour' },
      { front: 'Dog', back: 'Chien' },
    ])
  })

  it('throws on a CSV line missing a comma', () => {
    expect(() => parseImportFile('Hello Bonjour', 'cards.csv')).toThrow('Line 1')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseImportFile('not json', 'cards.json')).toThrow('Invalid JSON')
  })

  it('throws on an unsupported file extension', () => {
    expect(() => parseImportFile('front,back', 'cards.txt')).toThrow('Unsupported file type')
  })
})
