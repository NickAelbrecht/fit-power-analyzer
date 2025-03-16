import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { Store, select } from '@ngrx/store';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { curveLinear } from 'd3-shape';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { FitActivity, HeartRateData } from '../../services/fit-parser.service';
import * as fromActivityReducer from '../../store/activity/activity.reducer';

@Component({
  selector: 'app-power-dashboard',
  standalone: true,
  imports: [CommonModule, NgxChartsModule],
  templateUrl: './power-dashboard.component.html',
  styleUrls: ['./power-dashboard.component.scss'],
})
export class PowerDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  selectedActivity$: Observable<FitActivity | null>;
  powerChartData$: Observable<any[]>;
  private destroy$ = new Subject<void>();

  // Chart options - initialize with default dimensions
  view: [number, number] = [700, 350]; // Default dimensions
  showXAxis = true;
  showYAxis = true;
  gradient = false;
  showLegend = true;
  showXAxisLabel = true;
  xAxisLabel = 'Time';
  showYAxisLabel = true;
  yAxisLabel = 'Power (W) / Heart Rate (bpm)';
  colorScheme = 'cool'; // Using a predefined color scheme name
  curve = curveLinear; // Set the curve type for line interpolation

  constructor(
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Get selected activity
    this.selectedActivity$ = this.store.pipe(
      select((state) => state.activities),
      map((activityState) => {
        const selectedId = activityState.selectedActivityId;
        if (!selectedId) return null;
        return activityState.entities[selectedId] || null;
      }),
      takeUntil(this.destroy$)
    );

    // Transform power data for chart
    this.powerChartData$ = this.selectedActivity$.pipe(
      map((activity) => {
        if (!activity || !activity.powerData || activity.powerData.length === 0) {
          // Return sample data when no activity is selected
          return this.getSampleData();
        }

        // Sort the data by timestamp to ensure proper line connections
        const sortedPowerData = [...activity.powerData].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const series = [
          {
            name: 'Power',
            series: sortedPowerData.map((point) => ({
              name: new Date(point.timestamp),
              value: point.power,
            })),
          },
        ];

        // Add heart rate data if available
        if (activity.heartRateData && activity.heartRateData.length > 0) {
          const sortedHeartRateData = [...activity.heartRateData].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          series.push({
            name: 'Heart Rate',
            series: sortedHeartRateData.map((point: HeartRateData) => ({
              name: new Date(point.timestamp),
              value: point.heartRate,
            })),
          });
        }

        console.log('Chart data prepared:', series);
        return series;
      })
    );
  }

  ngOnInit(): void {
    console.log('PowerDashboardComponent initialized');
  }

  ngAfterViewInit(): void {
    // Only calculate dimensions in the browser
    if (isPlatformBrowser(this.platformId)) {
      // Calculate dimensions after view is initialized
      setTimeout(() => this.onResize(), 100);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onResize(): void {
    // Only run this in the browser, not during server-side rendering
    if (isPlatformBrowser(this.platformId)) {
      const containerElement = document.getElementById('chart-container');
      if (containerElement) {
        // Get the width of the container
        const width = containerElement.clientWidth || 700;
        // Set the height proportionally
        const height = Math.min(350, width * 0.5);

        // Update the view dimensions for the chart
        this.view = [width, height];
        console.log('Chart resized to:', this.view);
      }
    } else {
      // Set default dimensions for SSR
      this.view = [700, 350];
    }
  }

  // Generate sample data to ensure chart rendering
  private getSampleData() {
    return [
      {
        name: 'Sample Power',
        series: [
          { name: new Date('2023-01-01T10:00:00'), value: 120 },
          { name: new Date('2023-01-01T10:05:00'), value: 150 },
          { name: new Date('2023-01-01T10:10:00'), value: 140 },
          { name: new Date('2023-01-01T10:15:00'), value: 170 },
          { name: new Date('2023-01-01T10:20:00'), value: 130 },
        ],
      },
    ];
  }
}
