import { Routes } from '@angular/router';
import { ActivityDetailComponent } from './core/activity-detail/activity-detail.component';
import { ActivityListComponent } from './core/activity-list/activity-list.component';
import { DashboardComponent } from './core/dashboard/dashboard.component';
import { PowerAnalysisComponent } from './core/power-analysis/power-analysis.component';

export const routes: Routes = [
  // Dashboard as default route
  { path: '', component: DashboardComponent },

  // Activities routes
  { path: 'activities', component: ActivityListComponent },
  { path: 'activities/:id', component: ActivityDetailComponent },

  // Analysis route
  { path: 'analysis', component: PowerAnalysisComponent },

  // Redirect any other routes to dashboard
  { path: '**', redirectTo: '' },
];
