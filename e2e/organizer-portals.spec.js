import { expect, test, mockApi, organizer, demoOrganizerEvent } from './fixtures/mockApi.js'

const authenticateOrganizer = async (page) => {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'organizer-token')
    localStorage.setItem('user', JSON.stringify(user))
  }, organizer)
}

test.describe('organizer authorization, scanner and analytics portals', () => {
  test('attendee is denied access to organizer-only scanner and analytics surfaces', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Toggle Navigation Menu' })).toBeVisible()
    await expect(page.getByTitle('Open Organizer Dashboard')).toHaveCount(0)
  })

  test('organizer validates valid, wrong-event, invalid and duplicate tickets then confirms check-in', async ({
    page,
  }) => {
    await authenticateOrganizer(page)
    await mockApi(page, { user: organizer, events: [demoOrganizerEvent] })
    await page.goto('/')
    await page.getByTitle('Open Organizer Dashboard').click({ force: true })
    await page.getByTitle('Launch Scanner Portal').click({ force: true })
    await expect(page.getByRole('main', { name: 'Access Coordinator Scanner Portal' })).toBeVisible()
    await page.getByRole('button', { name: /LAUNCH SCANNER/ }).click({ force: true })
    const input = page.getByLabel('MANUAL TICKET CODE ENTRY')
    await input.fill('VALID-1001')
    await page.getByRole('button', { name: 'VALIDATE / CHECK IN' }).click()
    await expect(page.getByRole('alert')).toContainText('ACCESS GRANTED')
    await page.getByRole('button', { name: 'CONFIRM CHECK-IN' }).click()
    await expect(page.getByRole('alert')).toContainText(/CHECKED.?IN|confirmed/i)

    for (const [code, expected] of [
      ['WRONG-1001', 'WRONG_EVENT'],
      ['USED-1001', 'ALREADY_USED'],
      ['INVALID-1001', 'INVALID'],
    ]) {
      await input.fill(code)
      await page.getByRole('button', { name: 'VALIDATE / CHECK IN' }).click()
      await expect(page.getByRole('alert')).toContainText(expected)
    }
  })

  test('organizer can open analytics and reports and switch report filters', async ({ page }) => {
    await authenticateOrganizer(page)
    await mockApi(page, { user: organizer, events: [demoOrganizerEvent] })
    await page.goto('/')
    await page.getByTitle('Open Real-time Event Analytics').click()
    await expect(page.getByRole('main', { name: 'Event Analytics Dashboard' })).toBeVisible()
    await expect(page.getByText('AVAILABLE TICKETS')).toBeVisible()
    await page.getByRole('button', { name: 'REPORTS' }).click()
    await expect(page.getByRole('main', { name: 'Sales and Attendance Reports Page' })).toBeVisible()
    await page.getByLabel('Select Report Type').selectOption('attendance')
    await page.getByLabel('Select Report Timeframe').selectOption('7d')
    await page.getByRole('button', { name: 'GENERATE REPORT' }).click()
    await expect(page.getByText('CHECKED-IN ATTENDEES')).toBeVisible()
  })
})
