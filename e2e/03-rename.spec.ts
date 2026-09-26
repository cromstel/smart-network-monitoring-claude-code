import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('renaming a device persists after reload', async ({ page }) => {
  await login(page)
  await page.goto('/devices')
  await page.locator('table').getByRole('link', { name: /Kitchen Echo/ }).click()
  await page.waitForURL(/\/devices\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Kitchen Echo' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  const name = page.getByLabel('Name')
  await name.fill('Kitchen Speaker')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Kitchen Speaker' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kitchen Speaker' })).toBeVisible()
})
