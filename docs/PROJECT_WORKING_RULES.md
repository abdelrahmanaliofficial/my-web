# Project Working Rules

These rules govern every subsequent implementation task in the Abdelrahman Ali website repository.

## Target architecture

- Existing React/Vite/TypeScript frontend.
- Laravel REST API.
- MySQL database.
- Laravel Sanctum authentication.
- Persistent Laravel storage.
- Existing Express server may serve the frontend or proxy requests, but must not create a competing business backend.

## General engineering rules

1. Inspect the actual current code before modifying any file.
2. Work only on the scope of the current task.
3. Preserve existing functional components, routes, records and design unless the current task requires changing them.
4. Do not rebuild the application from scratch.
5. Never invent missing API endpoints, database functionality or successful operations.
6. Never use `localStorage` as the source of truth for business data, accounts, invoices, projects or permissions.
7. Never hardcode credentials, passwords, API keys or private secrets.
8. Never remove existing records or run destructive database commands without explicit approval.
9. Follow the existing project architecture and naming conventions.
10. Do not duplicate existing models, routes, migrations or services.
11. Do not modify unrelated modules.
12. Use clear types, validation, authorization and error handling.
13. Every successful save must be confirmed by actual backend persistence.
14. Test the specific functionality implemented in the current task.
15. Do not claim that a test passed unless it was actually executed.

## Required workflow for every task

1. Inspect relevant files and dependencies.
2. Identify existing functionality and defects.
3. State the implementation scope.
4. Implement only the current task.
5. Run relevant tests.
6. Check for regressions.
7. Document modified files and actual test results.
8. Identify unresolved blockers.
9. Stop and wait for the next prompt.

If a required backend endpoint, database table, dependency or configuration is missing, report the exact blocker and implement only what can safely be completed.

Never expose `.env` secrets, credentials or private customer data in reports.

## Definition of done

A task is complete only when its code changes are in place, relevant tests have actually been run, regressions have been considered, modified files and results are documented, and unresolved blockers are stated. A UI element or source file alone is not proof that a feature works.

The project objective is a secure, production-quality personal website and client management system, not a visual prototype.

## Scope of this document

This file records the project-wide working rules. It does not itself implement an application feature or change runtime behavior. The rules must be applied to every subsequent prompt and code change.
