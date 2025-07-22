import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { Observable, map } from 'rxjs';
import { FitActivity } from '../../services/fit-parser.service';
import * as ActivityActions from '../../store/activity/activity.actions';
import * as fromActivityReducer from '../../store/activity/activity.reducer';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { PowerDashboardComponent } from '../power-dashboard/power-dashboard.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FileUploadComponent, PowerDashboardComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  activities$: Observable<FitActivity[]>;
  recentActivities$: Observable<FitActivity[]>;
  selectedActivityId$: Observable<string | null>;
  maxPower = 0;
  avgPower = 0;

  constructor(
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    private router: Router
  ) {
    // Get all activities
    this.activities$ = this.store.pipe(
      select((state) => state.activities),
      select(fromActivityReducer.selectAll)
    );

    // Get only the 5 most recent activities for the dashboard
    this.recentActivities$ = this.activities$.pipe(
      map((activities) => {
        return [...activities]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
      })
    );

    // Get selected activity ID
    this.selectedActivityId$ = this.store.pipe(
      select((state) => state.activities.selectedActivityId)
    );
  }

  ngOnInit(): void {
    // Load activities on init
    this.store.dispatch(ActivityActions.loadActivities());

    // Calculate statistics when activities change
    this.activities$.subscribe((activities) => {
      this.calculateStats(activities);
    });
  }

  navigateToActivities(): void {
    this.router.navigate(['/activities']);
  }

  clearAllActivities(): void {
    if (confirm('Are you sure you want to clear all activities? This cannot be undone.')) {
      this.store.dispatch(ActivityActions.clearAllActivities());
    }
  }

  selectActivity(id: string): void {
    this.store.dispatch(ActivityActions.selectActivity({ id }));
    // Navigate to the activity detail view
    this.router.navigate(['/activities', id]);
  }

  // Activity display helpers
  formatActivityName(activity: FitActivity): string {
    // If activity has a name, use it
    if (activity.name && activity.name.trim() !== '' && !activity.name.includes(activity.id)) {
      return activity.name;
    }

    // Otherwise, create a name from the date and type
    const dateStr = new Date(activity.date).toLocaleDateString();

    // Standardize activity type for display
    let displayType = 'Activity';
    const type = activity.type.toLowerCase();
    if (type.includes('cycl') || type.includes('bike') || type.includes('biking')) {
      displayType = 'Cycling';
    } else if (type.includes('run')) {
      displayType = 'Running';
    } else if (type.includes('swim')) {
      displayType = 'Swimming';
    } else if (type.includes('walk')) {
      displayType = 'Walking';
    } else if (type.includes('hik')) {
      displayType = 'Hiking';
    } else if (type.includes('strength') || type.includes('train')) {
      displayType = 'Strength Training';
    } else {
      displayType = activity.type.charAt(0).toUpperCase() + activity.type.slice(1);
    }

    return `${displayType} - ${dateStr}`;
  }

  getActivityIcon(activity: FitActivity): string {
    const type = activity.type.toLowerCase();
    if (type.includes('cycl') || type.includes('bike') || type.includes('biking')) {
      return 'directions_bike';
    } else if (type.includes('run')) {
      return 'directions_run';
    } else if (type.includes('swim')) {
      return 'pool';
    } else if (type.includes('walk')) {
      return 'directions_walk';
    } else if (type.includes('hik')) {
      return 'terrain';
    } else if (type.includes('strength') || type.includes('train')) {
      return 'fitness_center';
    } else {
      return 'fitness_center';
    }
  }

  getActivityTypeClass(activity: FitActivity): string {
    const type = activity.type.toLowerCase();
    if (type.includes('cycl') || type.includes('bike') || type.includes('biking')) {
      return 'activity-type-cycling';
    } else if (type.includes('run')) {
      return 'activity-type-running';
    } else if (type.includes('swim')) {
      return 'activity-type-swimming';
    } else if (type.includes('walk')) {
      return 'activity-type-walking';
    } else if (type.includes('hik')) {
      return 'activity-type-hiking';
    } else if (type.includes('strength') || type.includes('train')) {
      return 'activity-type-strength_training';
    } else {
      return `activity-type-${type}`;
    }
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
    } else {
      return `${secs}s`;
    }
  }

  private calculateStats(activities: FitActivity[]): void {
    if (!activities || activities.length === 0) {
      this.maxPower = 0;
      this.avgPower = 0;
      return;
    }

    // Find max power across all activities
    this.maxPower = Math.max(...activities.map((a) => a.maxPower));

    // Calculate average power across all activities
    const totalPower = activities.reduce((sum, activity) => sum + activity.avgPower, 0);
    this.avgPower = Math.round(totalPower / activities.length);
  }
}
