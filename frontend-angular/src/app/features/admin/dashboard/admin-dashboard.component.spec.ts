import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { AdminDashboardComponent } from './admin-dashboard.component';
import { API_URL } from '@core/tokens/app.tokens';
import { AuthService } from '@core/services/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { AdminDashboard } from '@core/models/admin-dashboard';
import { AppConfigService } from '@core/services/app-config.service';
import { provideAppConfigTesting } from '@shared/testing/app-config-testing';
import { provideTranslocoTesting } from '@shared/testing/transloco-testing';

const apiUrl = 'http://api.test';
const dashboardUrl = `${apiUrl}/admin/dashboard`;

// The real ThemeService touches window.matchMedia, which jsdom lacks.
const themeStub = { provide: ThemeService, useValue: { theme: signal('light') } };

function dashboard(overrides: Partial<AdminDashboard> = {}): AdminDashboard {
  return {
    activeUserCount: 42,
    sharedWorkspaceCount: 8,
    activeProjectCount: 17,
    taskCount: 230,
    purgeableProjectCount: 0,
    deletedUserCount: 0,
    lockedOutUserCount: 0,
    deletedProjectCount: 3,
    deletedWorkspaceCount: 1,
    newUserCount: 0,
    newUserWindowDays: 7,
    environment: 'Development',
    recentUsers: [],
    ...overrides,
  };
}

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  // Per test rather than in a beforeEach, so one spec can withhold the trash window. Two
  // describes each configuring TestBed poisons it for the rest of the run.
  async function setup(trashWindowDays: number | null = 30) {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslocoTesting(),
        provideAppConfigTesting(trashWindowDays),
        themeStub,
        { provide: API_URL, useValue: apiUrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    // The header's weather widget self-fetches once the page renders; fail it so it leaves
    // no open request. It is covered by its own spec.
    httpMock.match('https://ipwho.is/').forEach((r) => r.error(new ProgressEvent('offline')));
    httpMock.verify();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return element().textContent ?? '';
  }

  async function respond(stats: AdminDashboard | null) {
    const request = httpMock.expectOne(dashboardUrl);
    if (stats) request.flush(stats);
    else request.flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // The brow is the shared greeting, so this covers the extraction as much as the page.
  it('greets the admin by name, with the profile behind it', async () => {
    await setup();
    TestBed.inject(AuthService).currentUser.set({
      id: '1',
      email: 'admin@example.com',
      firstName: 'Ada',
      lastName: 'Admin',
      isAdmin: true,
    });
    await respond(dashboard());

    const greeting = element().querySelector('.home-greeting');
    expect(greeting?.textContent).toContain('Ada');
    expect(greeting?.querySelector('a')?.getAttribute('href')).toBe('/profile');
  });

  // The bare app name would read as the tenant-content page that was deleted, and an
  // environment inside the <h1> would land in the heading's accessible name.
  it('names the instance it administers, with the environment beside the heading', async () => {
    await setup();
    await respond(dashboard());

    expect(element().querySelector('h1')?.textContent?.trim()).toBe('Rost Administration');
    expect(element().querySelector('.env-chip')?.textContent).toContain('Development');
  });

  // AdminLayoutComponent already paints one behind every admin page, and two stack into a
  // glow twice as strong on this page alone.
  it('leaves the aurora to the admin layout', async () => {
    await setup();
    await respond(dashboard());

    expect(element().querySelectorAll('app-aurora')).toHaveLength(0);
  });

  it('counts what the instance holds, one unit per metric', async () => {
    await setup();
    await respond(dashboard());

    const tiles = element().querySelectorAll('.kpi');
    expect(tiles).toHaveLength(4);
    expect(tiles[0].textContent).toContain('42');
    expect(tiles[0].textContent).toContain('Users');
    expect(tiles[1].textContent).toContain('Shared workspaces');
    expect(tiles[2].textContent).toContain('Projects');
    expect(tiles[3].textContent).toContain('Tasks');
  });

  // The admin acts on accounts and on lifecycle, never on tenant content, so only the
  // account metric has a page behind it.
  it('links the account metric and leaves the content counts inert', async () => {
    await setup();
    await respond(dashboard());

    const links = element().querySelectorAll('a.kpi');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/admin/users');
  });

  it('says so in one line when nothing is waiting, rather than in cards reading nought', async () => {
    await setup();
    await respond(dashboard());

    expect(element().querySelectorAll('.attention-card')).toHaveLength(0);
    expect(text()).toContain('Nothing needs a decision');
  });

  it('raises one card per open decision, and drops the settled ones', async () => {
    await setup();
    await respond(dashboard({ purgeableProjectCount: 118, deletedUserCount: 4 }));

    const cards = element().querySelectorAll('.attention-card');
    expect(cards).toHaveLength(2);

    expect(cards[0].textContent).toContain('118');
    expect(cards[0].textContent).toContain('projects past the window');
    expect(cards[0].getAttribute('href')).toBe('/admin/trash/projects');

    expect(cards[1].textContent).toContain('accounts in the trash');
    expect(cards[1].getAttribute('href')).toBe('/admin/trash/users');
  });

  // Every card promises somewhere to act, and there is no unlock surface to send anyone to,
  // so this number reads as context rather than as a queue item.
  it('keeps locked-out accounts out of the queue and states them as context', async () => {
    await setup();
    await respond(dashboard({ lockedOutUserCount: 2 }));

    expect(element().querySelectorAll('.attention-card')).toHaveLength(0);
    expect(element().querySelector('.context-strip')?.textContent).toContain(
      '2 accounts locked out',
    );
    // The empty state is scoped to decisions for exactly this pairing: "nothing is
    // waiting" would contradict the locked-out count three lines below it.
    expect(text()).toContain('Nothing needs a decision');
    expect(text()).not.toContain('Nothing is waiting');
  });

  // A paragraph with no children still holds the page's section gap open.
  it('drops the small print entirely when there is none to state', async () => {
    await setup(null);
    await respond(
      dashboard({ deletedProjectCount: 0, deletedWorkspaceCount: 0, lockedOutUserCount: 0 }),
    );

    expect(element().querySelectorAll('.context-strip')).toHaveLength(0);
  });

  // Singular and plural are separate keys here, so the count picking the wrong one is a
  // real failure mode rather than a hypothetical.
  it('agrees with its own count when only one thing is waiting', async () => {
    await setup();
    await respond(dashboard({ deletedUserCount: 1 }));

    const card = element().querySelector('.attention-card');
    expect(card?.textContent).toContain('account in the trash');
    expect(card?.textContent).not.toContain('accounts in the trash');
  });

  it("lists recent signups as accounts, which are the admin's own domain", async () => {
    await setup();
    await respond(
      dashboard({
        recentUsers: [
          {
            id: '1',
            email: 'ada@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
            createdAt: '2026-08-20T09:00:00Z',
            isDeleted: false,
          },
        ],
      }),
    );

    const rows = element().querySelectorAll('.signup-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Ada Lovelace');
    expect(rows[0].textContent).toContain('ada@example.com');
  });

  it('quotes the window the server published, alongside what is sitting in the trash', async () => {
    await setup();
    await respond(dashboard({ deletedProjectCount: 3, deletedWorkspaceCount: 1 }));

    const strip = element().querySelector('.context-strip');
    // Names projects: workspace purge is not cutoff-gated, so a bare "trash window: 30
    // days" beside a workspaces count promised a deadline nothing enforces for those.
    expect(strip?.textContent).toContain('Projects are purgeable 30 days after deletion');
    expect(strip?.textContent).toContain('3 projects in the trash');
    expect(strip?.textContent).toContain('1 workspace in the trash');
  });

  // The tooltip never opens for a keyboard or screen-reader user, so the window the server
  // published has to reach them some other way.
  it('labels the signups chip with the window rather than leaving a bare number', async () => {
    await setup();
    await respond(dashboard({ newUserCount: 2 }));

    const kpi = element().querySelector('a.kpi');
    expect(kpi?.querySelector('.role-chip')?.textContent).toContain('+2');
    // Real text, not an aria-label: a bare span's implicit generic role prohibits a name,
    // so browsers drop aria-label there and the sentence would reach nobody.
    expect(kpi?.querySelector('.sr-only')?.textContent).toContain('Signups in the last 7 days: 2');
  });

  // The sentence agrees with the window, not the signup count — "days" is its only noun.
  it('inflects the label on the window rather than on the number of signups', async () => {
    await setup();
    await respond(dashboard({ newUserCount: 1, newUserWindowDays: 1 }));

    expect(element().querySelector('a.kpi .sr-only')?.textContent).toContain(
      'Signups in the last 1 day: 1',
    );
  });

  // The strip drops a zero for the same reason the queue does: it would restate, in small
  // print, what the empty state above it just said in a sentence.
  it('leaves settled counts out of the small print', async () => {
    await setup();
    await respond(dashboard({ deletedProjectCount: 0, deletedWorkspaceCount: 2 }));

    const strip = element().querySelector('.context-strip');
    expect(strip?.textContent).not.toContain('projects in the trash');
    expect(strip?.textContent).toContain('2 workspaces in the trash');
  });

  it('sends each trash count to the rows behind it', async () => {
    await setup();
    await respond(dashboard({ deletedProjectCount: 3 }));

    const link = element().querySelector('.context-strip a');
    expect(link?.getAttribute('href')).toBe('/admin/trash/projects');
  });

  // The band, the queue and the strip all read one resource, so a failed load has to take
  // the page down to a message rather than render half of it from a throwing value().
  it('shows a failure instead of a page when the counts do not load', async () => {
    await setup();
    await respond(null);

    expect(element().querySelectorAll('.kpi')).toHaveLength(0);
    expect(element().querySelectorAll('.attention-card')).toHaveLength(0);
    expect(text()).toContain('Failed to load dashboard data.');
  });

  it('asks the config to retry, so one failed /config does not cost the session', async () => {
    await setup();
    await respond(dashboard());

    expect(TestBed.inject(AppConfigService).reloadIfFailed).toHaveBeenCalled();
  });

  // The window is server policy with no client-side default, so the page renders without
  // it rather than quoting a number nobody confirmed.
  it('drops the policy sentence when the window never arrived', async () => {
    await setup(null);
    await respond(dashboard({ deletedProjectCount: 3 }));

    const strip = element().querySelector('.context-strip');
    expect(strip?.textContent).not.toContain('purgeable');
    expect(strip?.textContent).not.toContain('context.window');
    // The counts beside it still render; only the sentence it cannot state is absent.
    expect(strip?.textContent).toContain('3 projects in the trash');
  });
});
