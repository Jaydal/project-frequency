import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/esp32', () => ({ getControllerUrl: vi.fn() }))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getControllerUrl } from '@/lib/esp32'
import { POST } from './route'

const ESP32_URL = 'http://esp32'

const makeReq = (body: unknown) =>
  new Request('http://localhost/api/display/0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const params = (row: string) => ({ params: Promise.resolve({ row }) })

describe('POST /api/display/[row]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards text to correct ESP32 row endpoint', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(ESP32_URL)
    mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const res = await POST(makeReq({ text: 'RUNNING' }), params('1'))
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      `${ESP32_URL}/display/1`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'RUNNING' }) })
    )
  })

  it('returns 400 for row out of range', async () => {
    const res = await POST(makeReq({ text: 'X' }), params('5'))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 when text exceeds 20 characters', async () => {
    const res = await POST(makeReq({ text: 'X'.repeat(21) }), params('0'))
    expect(res.status).toBe(400)
  })

  it('returns 503 when controller is offline', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(null)
    const res = await POST(makeReq({ text: 'HI' }), params('0'))
    expect(res.status).toBe(503)
  })
})
