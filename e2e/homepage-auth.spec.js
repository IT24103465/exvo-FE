import { expect, test, mockApi } from './fixtures/mockApi.js'

test.describe('homepage and authentication', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
  })

  test('visitor navigates the homepage and opens the login form', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#home')).toBeVisible()
    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click({ force: true })
    await page.getByRole('button', { name: 'LOGIN' }).click({ force: true })
    await expect(page.getByLabel('EMAIL / USERNAME')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'PASSWORD' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'LOGIN TO EXVO' })).toBeVisible()
  })

  test('invalid credentials show an authentication error without authenticating', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click({ force: true })
    await page.getByRole('button', { name: 'LOGIN' }).click({ force: true })
    await page.getByLabel('EMAIL / USERNAME').fill('invalid@example.test')
    await page.getByRole('textbox', { name: 'PASSWORD' }).fill('not-a-real-password')
    await page.getByRole('button', { name: 'LOGIN TO EXVO' }).click({ force: true })
    await expect(page.getByRole('status')).toContainText('Invalid credentials')
    await expect(page.getByRole('button', { name: 'Open profile options' })).toHaveCount(0)
  })

  test('visitor can switch to attendee registration and receives validation for short passwords', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click({ force: true })
    await page.getByRole('button', { name: 'LOGIN' }).click({ force: true })
    await page.getByRole('button', { name: 'Create an account' }).click({ force: true })
    await expect(page.getByRole('radio', { name: 'Booking Ticket' })).toHaveAttribute('aria-checked', 'true')
    await page.getByLabel('FULL NAME').fill('New Attendee')
    await page.getByLabel('EMAIL ADDRESS').fill('new@example.test')
    await page.getByRole('textbox', { name: 'PASSWORD' }).fill('short')
    await page.getByRole('button', { name: /CREATE ACCOUNT/ }).click({ force: true })
    await expect(page.getByRole('textbox', { name: 'PASSWORD' })).toHaveAttribute('minlength', '6')
  })

  test('catalog outage presents a retryable event loading error', async ({ page }) => {
    await page.unroute('**/api/**')
    await mockApi(page, { failEvents: true })
    await page.goto('/')
    await expect(page.getByRole('alert').first()).toContainText('Unable to load events')
    await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible()
  })
})
