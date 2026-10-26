# Time Registration System

VIA internship time registration project. The frontend uses React and Vite. The backend uses Node.js, Express and SQLite.

## Run locally on Windows

Tested with Node.js 24.13.0 and npm 11.6.2 on Windows x64. Install Node.js first, then open PowerShell in the repository folder.

### 1. Prepare the backend

```powershell
cd Backend
npm.cmd ci --ignore-scripts
Copy-Item .env.example .env
```

The install command uses the native binaries shipped with the pinned packages. It works on the tested Windows setup. If a different platform cannot load a native module, install with `npm.cmd ci` and follow the package's native build requirements.

Edit `Backend/.env`: choose your own `JWT_SECRET` and the first Supervisor's name, email and password. The example credentials are placeholders. A password is required, but there are no strength rules yet. Passwords are hashed before storage.

```powershell
npm.cmd run db:init
npm.cmd run db:seed-supervisor
npm.cmd start
```

The server listens on port 3000. The first-Supervisor script creates one account only when no Supervisor exists. Running it again does not reset an existing account.

SQLite is a library used by the backend. Its database file is created at `Backend/data/database.sqlite`; a separate database server is not needed for local development. Existing databases are migrated automatically when the backend starts. Back up an existing file before updating the application. If old accounts have conflicting email addresses after trimming and converting to lowercase, startup stops with a clear error so the addresses can be corrected without merging or deleting accounts.

### 2. Start the frontend in a second terminal

From the repository folder:

```powershell
cd Frontend
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. Keep both terminals running. VS Code can edit the project and host the terminals; Node.js runs the backend application.

### 3. Run checks

In `Backend`:

```powershell
npm.cmd test
```

The tests start a real HTTP server against temporary databases. They do not modify the normal application database.

In `Frontend`:

```powershell
npm.cmd run lint
npm.cmd run build
```

## Registration

Public registration has four fields: first name, last name, email and password. Names are trimmed. Email addresses are trimmed and stored in lowercase, so capital letters or surrounding spaces cannot create duplicate accounts. The existing database student-number column is not collected by this form.

Validation runs in the browser for quick feedback and on the server for enforcement. Any non-empty password is accepted for now, including short passwords. Passwords are not trimmed. Registration and first-Supervisor setup store salted bcrypt hashes with a cost of 10; login compares the entered password against that hash. Bcrypt considers only the first 72 bytes of a password. Password strength rules and a possible move to Argon2 are separate tasks.

Public registration always creates an enabled Intern account without an Internship record. It cannot create a Supervisor account.

## Project management

Supervisors can create, edit and archive projects from their dashboard. A project name is required and has a limit of 100 characters; the optional description has a limit of 2,000 characters. Editing changes the existing project, preserving its identity and related records.

Archiving sets `archived_at`. It removes the project from the default active list and prevents editing or adding tasks. Supervisors can select **Show archived projects** and **View Tasks** to inspect its retained tasks. Archiving does not delete tasks, assignments, attendance or task-time records. A project with an open Intern assignment cannot be archived until that assignment is ended or moved. Repeating an archive request keeps the original archive timestamp.

Project-management requests check the user's current account and role in the database, as well as their JWT. An old Supervisor token does not give project-management access after that account is disabled, deleted or demoted.

Intern-to-project assignment implementation is a separate task. Its future endpoint must refuse archived projects and enforce at most one active project assignment per internship. The [wireframes](docs/wireframes/project-management.svg) include that planned screen; [screen notes](docs/wireframes/README.md) explain it. The current task-definition panel remains available for active projects.

### Project API

| Request | Purpose |
| --- | --- |
| `GET /projects` | List active projects for a logged-in, enabled account. |
| `GET /projects?includeArchived=true` | Include archived projects; Supervisor only. |
| `POST /projects` | Create a project; Supervisor only. |
| `PATCH /projects/:projectId` | Edit name and/or description; Supervisor only. |
| `POST /projects/:projectId/archive` | Archive a project; Supervisor only. |
| `GET /projects/:projectId/tasks` | Read project tasks, including retained tasks after archive. |
| `POST /projects/:projectId/tasks` | Create a task in an active project. |

Create/edit bodies contain `name` and `description`. Validation errors return HTTP 400 with `error` and `fieldErrors`; missing projects return 404; an archive or archived-project conflict returns 409. The server sets the creator from the authenticated account.

## Manual test checklist

1. Submit an empty registration form: field errors should appear. Try a malformed email and an empty password.
2. Register with valid names, email and a simple password such as `a`. Log in with the new Intern account. Register again using the same email in different capitals: the duplicate must be refused.
3. Log out and log in with the seeded Supervisor. Select **New Project**. Submit an empty name, then create a project with a name and description.
4. Find the new project in **Manage Projects** and in the task panel's project selector. Create a task using the existing task form.
5. Edit the project's name and description. Its task should remain, and the task selector should show the new name.
6. Select **Archive**, then cancel: the project should remain active. Repeat and confirm: it should leave both active lists.
7. Select **Show archived projects**. The project should be marked Archived. **View Tasks** should still show its task; Edit and Archive actions should be absent.
8. Restart the backend. The project and archive state should still be present.
9. Start a task draft under one project, then edit a different project. The selected project and draft should stay. Archive the draft's project: the draft remains, and Create Task is disabled until you choose an active project.

The automated backend tests also cover archive refusal with active assignments, preservation of recorded history, old-database migration, Intern permission refusal and revoked Supervisor access.

## How a project is saved

`ProjectManagementPanel.jsx` collects the form. `projectService.js` sends an HTTP request with the JWT. `app.js` routes it to `projects.js`, which checks access, validates the fields and writes to SQLite. The JSON response updates the list and refreshes the existing task panel.

`schema.sql` defines a new database; `migrations.js` updates older databases. `app.js` exports the Express application so tests can run it on a temporary port. `index.js` starts the normal server. These are separate steps so tests can exercise the same application without using the normal database or port.
