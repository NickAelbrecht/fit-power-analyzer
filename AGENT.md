# Agent Guidelines: FIT File Data Dashboard

## Context

Building a minimal Angular web application to visualize `.FIT` (Training File) file data as a data dashboard. The goal is the simplest viable architecture that scales if needed later. No over-engineering.

---

## Skills

The following skills are available and should be used when appropriate:

- **Agent**: For complex multi-step tasks, codebase exploration, or autonomous work
- **TaskCreate / TaskGet / TaskUpdate / TaskList**: Track implementation steps
- **Read / Write / Edit**: File operations (read first, then edit/write)
- **Glob / Grep**: Finding files and patterns in the codebase
- **Bash**: Git operations, npm/nx commands, file management
- **WebSearch / WebFetch**: Researching Angular best practices and FIT file specs
- **Skill**: Invoke other slash commands (`/simplify`, `/loop`, etc.)

---

## Do's

### Code & Architecture
- ✅ Use standalone components (Angular 14+) with `@Component` decorators
- ✅ Use signal-based state management (`computed()`, `effect()`) over RxJS where possible
- ✅ Keep components small and focused; extract logic to services/pipes
- ✅ Use OnPush change detection strategy by default
- ✅ Type everything (interfaces, generics) - no `any` unless explicitly justified
- ✅ Validate against [Official FIT File Specification](https://docs.garmin.com/en-US/training-and-fitness-program/fit-file-specification/) for field parsing

### Project Setup
- ✅ Start with bare essentials: CLI project or minimal monorepo
- ✅ Use `ng serve --hmr` for hot module replacement during dev
- ✅ Configure `ng build --configuration production` for deployments
- ✅ Use Angular JSON schema validators for config files

### Code Quality
- ✅ Run `/simplify` on changed code to review for reuse, quality, efficiency
- ✅ Prefer composition over inheritance
- ✅ Keep utility functions pure and testable
- ✅ Export only what's needed from modules

### Validation
- ✅ Validate assumptions against Angular docs (angular.dev), FIT spec, MDN
- ✅ Never guess API shapes or component contracts
- ✅ Test locally before committing; use `ng serve` to verify

---

## Don'ts

### Code & Architecture
- ❌ Do NOT add unused dependencies or heavy libraries unless proven necessary
- ❌ Do NOT over-engineer for scale prematurely
- ❌ Do NOT use NgRx, Signals + RxJS together unnecessarily
- ❌ Do NOT create deep component trees; keep max 3-4 levels
- ❌ Do NOT bundle FIT parsing logic in components; isolate in services
- ❌ Do NOT skip type exports that break encapsulation without reason

### Project Setup
- ❌ Do NOT add enterprise patterns (NgModules, complex DI) unless needed
- ❌ Do NOT use `ng add @angular-devkit/schematics` for unnecessary generators
- ❌ Do NOT configure multiple build targets until you have a deployment requirement

### Code Quality
- ❌ Do NOT write test scaffolding before understanding requirements
- ❌ Do NOT leave TODOs without implementing the plan or replacing with actual code

### Validation
- ❌ Do NOT assume FIT field IDs or structures without checking spec
- ❌ Do NOT trust third-party libraries blindly; inspect their implementations

---

## Guidelines

### General Approach
- Be concise in reasoning and outputs. No fluff.
- Aim to improve correctness and simplicity, not to please with verbose explanations.
- Be brutally honest about technical debt, anti-patterns, and unrealistic timelines.
- Challenge unnecessary complexity at every stage.

### Angular Best Practices (Latest Stack)
- Use Angular 16+ features where they simplify code (signals, control flow `@if`, `@for`)
- For new projects, consider Angular Elements if integration with non-Angular clients is needed
- Use `standalone: true` components as the default; avoid NgModules unless legacy requirement
- Prefer native DOM queries over `Renderer2`
- Use `async` pipe cautiously; prefer subscription lifecycle management in OnPush

### FIT File Handling
- Parse binary FIT files in web worker or backend to avoid blocking main thread
- Consider using established parsers (fitparser, fit-fs) and validate their output
- Cache parsed data with appropriate invalidation strategies
- Visualize metrics progressively as chunks are decoded

### Performance
- Use `@Input({ required: true })` to prevent null/undefined component values
- Defer heavy computations to `setTimeout` or web workers
- Virtualize long lists (`<cdk-virtual-scroll-viewport>`)
- Profile with `Chrome DevTools Performance` before optimizing blindly

---

## Quick Reference

| Task | Command / Pattern |
|------|------------------|
| Start dev server | `ng serve --hmr` |
| Build for prod | `ng build --configuration production --base-href /.../` |
| Run tests | `ng test` or `ng test --watch=false` |
| Check Angular version | `ng version` |
| Clean cache | `rm -rf node_modules/.cache` |

---

*Last updated: 2026-03-12*
