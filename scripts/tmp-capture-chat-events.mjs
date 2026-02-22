import { randomUUID } from 'node:crypto'

const friendlyId = randomUUID()
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z8MsAAAAASUVORK5CYII='

const sseRes = await fetch('http://localhost:3000/api/chat-events')
if (!sseRes.ok || !sseRes.body) throw new Error(`SSE failed ${sseRes.status}`)
const reader = sseRes.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
const events = []

const readLoop = (async () => {
  const timeout = Date.now() + 9000
  while (Date.now() < timeout) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const lines = block.split('\n')
      let event = ''
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!event || !data) continue
      try {
        const parsed = JSON.parse(data)
        const text = JSON.stringify(parsed)
        if (text.includes(friendlyId) || event === 'user_message') {
          events.push({ event, data: parsed })
        }
      } catch {}
    }
  }
})()

await new Promise((r) => setTimeout(r, 400))
const sendRes = await fetch('http://localhost:3000/api/send', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sessionKey: friendlyId,
    friendlyId,
    message: 'image event probe',
    attachments: [{ id: randomUUID(), name: 'probe.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${base64}` }],
  }),
})
const sendText = await sendRes.text()
await readLoop
await reader.cancel().catch(() => {})
console.log('friendlyId', friendlyId)
console.log('send', sendRes.status, sendText)
console.log('events', JSON.stringify(events, null, 2))
