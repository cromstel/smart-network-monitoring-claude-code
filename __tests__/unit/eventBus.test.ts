import { isVisibleTo, listenerCount, publish, subscribe } from '@/lib/services/eventBus'

it('delivers to every subscriber and unsubscribes cleanly', () => {
  const a: string[] = []
  const b: string[] = []
  const before = listenerCount()
  const offA = subscribe((e) => a.push(e.name))
  const offB = subscribe((e) => b.push(e.name))
  publish('bandwidth.tick', { uploadMbps: 1 })
  expect(a).toEqual(['bandwidth.tick'])
  expect(b).toEqual(['bandwidth.tick'])
  offA()
  offB()
  expect(listenerCount()).toBe(before) // no leaked listener
})

it('scopes alert.raised to its owner and hides internal events', () => {
  expect(isVisibleTo({ name: 'alert.raised', data: {}, userId: 'ana' }, 'ana')).toBe(true)
  expect(isVisibleTo({ name: 'alert.raised', data: {}, userId: 'ana' }, 'sam')).toBe(false)
  expect(isVisibleTo({ name: 'device.connected', data: {} }, 'sam')).toBe(true)
  expect(isVisibleTo({ name: 'settings.changed', data: {} }, 'sam')).toBe(false)
})
