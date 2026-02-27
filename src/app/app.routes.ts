import { Routes } from '@angular/router';
import { DashboardComponent } from './core/dashboard/dashboard.component';

// Minimal routing for a stable SPA deployment:
// - All paths show the dashboard component.
// - Once verified working in Cloudflare, we can reintroduce
//   more specific routes incrementally.
export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: '**', component: DashboardComponent },
];
