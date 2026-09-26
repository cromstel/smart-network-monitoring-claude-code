import { expect, type Page } from '@playwright/test'

export const ADMIN = { email: 'e2e-admin@example.test', password: 'e2e-password-123', name: 'E2E Admin' }

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /on your network/ })).toBeVisible()
}
