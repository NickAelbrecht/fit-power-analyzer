import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { FitActivity } from '../../services/fit-parser.service';
import * as ActivityActions from '../../store/activity/activity.actions';
import * as fromActivityReducer from '../../store/activity/activity.reducer';

@Component({
  selector: 'app-activity-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './activity-list.component.html',
  styleUrls: ['./activity-list.component.scss'],
})
export class ActivityListComponent implements OnInit {
  activities$: Observable<FitActivity[]>;
  filteredActivities$: Observable<FitActivity[]>;
  selectedActivityId$: Observable<string | null>;
  debug = false; // Ensure debug mode is off to prevent sample data generation

  // Filter and search properties
  searchTerm: string = '';
  activeFilter: string = 'all';
  private searchFilter$ = new BehaviorSubject<string>('');
  private typeFilter$ = new BehaviorSubject<string>('all');

  // Power zones (FTP percentages)
  private powerZones = [
    { name: 'zone1', min: 0, max: 55 }, // Active Recovery
    { name: 'zone2', min: 56, max: 75 }, // Endurance
    { name: 'zone3', min: 76, max: 90 }, // Tempo
    { name: 'zone4', min: 91, max: 105 }, // Threshold
    { name: 'zone5', min: 106, max: 120 }, // VO2 Max
    { name: 'zone6', min: 121, max: 150 }, // Anaerobic
    { name: 'zone7', min: 151, max: 999 }, // Neuromuscular
  ];

  constructor(
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    private router: Router
  ) {
    // Get all activities
    this.activities$ = this.store.pipe(
      select((state) => state.activities),
      select(fromActivityReducer.selectAll),
      tap((activities) => {
        console.log('Activities loaded:', activities.length);
        console.log('First activity:', activities[0]);
      })
    );

    // Create filtered activities observable
    this.filteredActivities$ = combineLatest([
      this.activities$,
      this.searchFilter$,
      this.typeFilter$,
    ]).pipe(
      map(([activities, searchTerm, typeFilter]) => {
        return activities.filter((activity) => {
          // Apply type filter
          if (typeFilter !== 'all' && activity.type !== typeFilter) {
            return false;
          }

          // Apply search filter if there's a search term
          if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            const activityName = this.formatActivityName(activity).toLowerCase();
            const activityDate = new Date(activity.date).toLocaleDateString().toLowerCase();

            return (
              activityName.includes(searchLower) ||
              activityDate.includes(searchLower) ||
              activity.type.toLowerCase().includes(searchLower)
            );
          }

          return true;
        });
      }),
      tap((filtered) => {
        console.log('Filtered activities:', filtered.length);
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

    // For debugging - add sample activity if none exist
    setTimeout(() => {
      this.activities$.subscribe((activities) => {
        if (activities.length === 0 && this.debug) {
          this.addSampleActivity();
        }
      });
    }, 1000);
  }

  // Helper method to add a sample activity for debugging
  private addSampleActivity() {
    if (!this.debug) return;

    const sampleActivity: FitActivity = {
      id: 'sample-' + new Date().getTime(),
      date: new Date(),
      name: 'Sample Activity',
      type: 'cycling',
      totalTime: 3600, // 1 hour
      powerData: Array(100)
        .fill(0)
        .map((_, i) => ({
          timestamp: new Date(Date.now() - (100 - i) * 10000),
          power: 150 + Math.round(Math.sin(i / 10) * 50),
        })),
      avgPower: 200,
      maxPower: 300,
      normalizedPower: 220,
    };

    this.store.dispatch(ActivityActions.addActivity({ activity: sampleActivity }));
  }

  selectActivity(id: string): void {
    // Navigate to the activity detail view
    this.router.navigate(['/activities', id]);

    // Also update the selected activity in the store
    this.store.dispatch(ActivityActions.selectActivity({ id }));
  }

  removeActivity(event: Event, id: string): void {
    event.stopPropagation(); // Prevent selecting the activity when clicking delete
    this.store.dispatch(ActivityActions.removeActivity({ id }));
  }

  clearAllActivities(): void {
    // Clear search term and reset filter
    this.searchTerm = '';
    this.activeFilter = 'all';
    this.searchFilter$.next('');
    this.typeFilter$.next('all');
  }

  // Filter methods
  filterActivities(): void {
    this.searchFilter$.next(this.searchTerm);
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.typeFilter$.next(filter);
  }

  // Activity display helpers
  formatActivityName(activity: FitActivity): string {
    // If activity has a name, use it
    if (activity.name && activity.name.trim() !== '' && !activity.name.includes(activity.id)) {
      return activity.name;
    }

    // Otherwise, create a name from the date and type
    const dateStr = new Date(activity.date).toLocaleDateString();
    return `${activity.type.charAt(0).toUpperCase() + activity.type.slice(1)} - ${dateStr}`;
  }

  getActivityIcon(activity: FitActivity): string {
    switch (activity.type.toLowerCase()) {
      case 'cycling':
        return 'directions_bike';
      case 'running':
        return 'directions_run';
      case 'swimming':
        return 'pool';
      case 'walking':
        return 'directions_walk';
      case 'hiking':
        return 'terrain';
      case 'strength_training':
        return 'fitness_center';
      default:
        return 'fitness_center';
    }
  }

  getActivityTypeClass(activity: FitActivity): string {
    return `activity-type-${activity.type.toLowerCase()}`;
  }

  getPowerZoneClass(power: number): string {
    // Default FTP value (can be made configurable in future)
    const defaultFTP = 250;

    // Calculate power as percentage of FTP
    const powerPercentage = (power / defaultFTP) * 100;

    // Find the zone
    for (const zone of this.powerZones) {
      if (powerPercentage >= zone.min && powerPercentage <= zone.max) {
        return zone.name;
      }
    }

    return '';
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

  // Calculate normalized power if not already available
  calculateNP(activity: FitActivity): number {
    if (activity.normalizedPower) {
      return activity.normalizedPower;
    }

    // Basic normalized power calculation (30-second rolling average^4)
    if (!activity.powerData || activity.powerData.length === 0) {
      return 0;
    }

    const powerValues = activity.powerData.map((p) => p.power);
    const windowSize = 30; // 30-second rolling average
    let sum = 0;
    let count = 0;

    for (let i = windowSize - 1; i < powerValues.length; i++) {
      let windowSum = 0;
      for (let j = 0; j < windowSize; j++) {
        windowSum += powerValues[i - j];
      }
      const avg = windowSum / windowSize;
      sum += Math.pow(avg, 4);
      count++;
    }

    if (count === 0) return 0;
    return Math.round(Math.pow(sum / count, 0.25));
  }

  // Generate a simple power sparkline visualization
  generatePowerSparkline(activity: FitActivity): string {
    if (!activity.powerData || activity.powerData.length < 2) {
      return 'linear-gradient(to right, #e0e0e0, #e0e0e0)';
    }

    // Sample the power data to get a reasonable number of points
    const maxPoints = 50;
    const step = Math.max(1, Math.floor(activity.powerData.length / maxPoints));
    const sampledData = activity.powerData.filter((_, i) => i % step === 0).map((p) => p.power);

    // Find min and max for scaling
    const maxPower = Math.max(...sampledData);
    const minPower = Math.min(...sampledData);
    const range = maxPower - minPower;

    // Generate gradient stops
    const stops = sampledData.map((power, index) => {
      const position = (index / (sampledData.length - 1)) * 100;
      const normalizedPower = range > 0 ? (power - minPower) / range : 0.5;

      // Color based on power intensity (from blue to red)
      const r = Math.min(255, Math.round(normalizedPower * 255));
      const g = Math.round(100 + 155 * (1 - Math.abs(normalizedPower - 0.5) * 2));
      const b = Math.min(255, Math.round((1 - normalizedPower) * 255));

      return `rgba(${r}, ${g}, ${b}, 0.8) ${position}%`;
    });

    return `linear-gradient(to right, ${stops.join(', ')})`;
  }
}
