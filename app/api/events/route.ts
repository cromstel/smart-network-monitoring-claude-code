/**
 * Server-Sent Events (ARCHITECTURE §6, AUDIT A-12). One-directional, proxy-friendly,
 * reconnects on its own. Events are invalidation signals; clients refetch the data.
 * alert.raised is delivered only to the owner of the triggering rule.
 */
import type { NextRequest } from 'next/server'
import { ANY_ROLE, authorise, errorResponse } from '@/lib/api/handler'
import { isVisibleTo, subscribe } from '@/lib/services/eventBus'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEEP_ALIVE_MS = 30_000

export async function GET(req: NextRequest): Promise<Response> {
  let userId: string
  try {
    userId = (await authorise(req, ANY_ROLE)).user.id
  } catch (err) {
    return errorResponse(err)
  }

  const encoder = new TextEncoder()
  let cleanup: () => void = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const unsubscribe = subscribe((event) => {
        if (!isVisibleTo(event, userId)) return
        send(`event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`)
      })
      const keepAlive = setInterval(() => send(`: keep-alive\n\n`), KEEP_ALIVE_MS)
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(keepAlive)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed by the client
        }
      }
      req.signal.addEventListener('abort', () => cleanup())
      send(`retry: 5000\n: connected\n\n`)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
