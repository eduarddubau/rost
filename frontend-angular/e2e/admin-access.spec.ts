import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[formcontrolname="email"]').fill(email);
  await page.locator('input[formcontrolname="password"]').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test.describe('Admin access', () => {
  test('the seeded admin can reach admin-only areas', async ({ page }) => {
    await login(page, 'admin@example.com');

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Rost Administration' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);

    // A nested admin route is reachable too (guard lets the admin through).
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Active Users' })).toBeVisible();
  });

  test('a non-admin user is redirected away from admin areas', async ({ page }) => {
    // dev2 is seeded with the standard User role, not Admin.
    await login(page, 'dev2@example.com');

    await page.goto('/admin');

    // adminGuard redirects authenticated non-admins home. Not to a project list:
    // that now needs a workspace id the guard has no business resolving.
    await expect(page).toHaveURL(/\/w\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Rost Administration' })).toHaveCount(0);
  });
});
