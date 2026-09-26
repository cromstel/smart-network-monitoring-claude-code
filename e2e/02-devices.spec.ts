import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('device list renders the seeded network and filters it', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Devices' }).first().click()
  await expect(page.getByRole('heading', { name: 'Devices' })).toBeVisible()
  const table = page.locator('table')
  await expect(table.getByText('Kitchen Echo')).toBeVisible()
  await expect(table.getByText('Office Printer')).toBeVisible()

  await page.getByPlaceholder(/Name, hostname/).fill('pihole')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table.getByText('Pi-hole')).toBeVisible()
})

test('an API route without a session is 401', async ({ request }) => {
  const res = await request.get('/api/devices', { headers: { cookie: '' } })
  expect(res.status()).toBe(401)
})
