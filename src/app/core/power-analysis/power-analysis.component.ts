import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, select } from '@ngrx/store';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { FitActivity, PowerData } from '../../services/fit-parser.service';
import * as fromActivityReducer from '../../store/activity/activity.reducer';
import { memoize } from '../../utils/memoize';

interface BestEffort {
  duration: number; // in seconds
  durationLabel: string;
  power: number;
  date?: Date;
  activityId?: string;
}

interface PowerZone {
  name: string;
  min: number;
  max: number;
  color: string;
}

@Component({
  selector: 'app-power-analysis',
  standalone: true,
  imports: [CommonModule, NgxChartsModule, FormsModule],
  templateUrl: './power-analysis.component.html',
  styleUrls: ['./power-analysis.component.scss'],
})
export class PowerAnalysisComponent implements OnInit {
  activities$: Observable<FitActivity[]>;
  bestEfforts$: Observable<BestEffort[]>;

  // FTP settings
  userFTP = localStorage.getItem('user-ftp') ? Number(localStorage.getItem('user-ftp')) : 250;

  // Time periods to analyze in seconds
  timePeriods = [
    { seconds: 1, label: '1 sec' },
    { seconds: 5, label: '5 sec' },
    { seconds: 10, label: '10 sec' },
    { seconds: 30, label: '30 sec' },
    { seconds: 60, label: '1 min' },
    { seconds: 300, label: '5 min' },
    { seconds: 1200, label: '20 min' },
    { seconds: 3600, label: '1 hour' },
  ];

  // Chart options for power curve
  powerCurveData: any[] = [];
  view: [number, number] = [700, 400];
  showXAxis = true;
  showYAxis = true;
  gradient = false;
  showLegend = true;
  showXAxisLabel = true;
  xAxisLabel = 'Duration';
  showYAxisLabel = true;
  yAxisLabel = 'Power (watts)';
  colorScheme: any = {
    domain: ['#5AA454', '#E44D25', '#7aa3e5'],
  };

  // Power zones based on FTP
  powerZones: PowerZone[] = [];

  activeSection = 'best-efforts'; // Default section
  ftpHistory: { date: Date; ftp: number }[] = [];

  // Add this property to track if FTP data is loaded
  private ftpHistoryLoaded = false;

  private memoizedBestEffort = memoize(this.findBestEffortForPeriod);

  // Add loading state
  isLoading = false;

  constructor(
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    private cdr: ChangeDetectorRef
  ) {
    this.activities$ = this.store.pipe(
      select((state) => state.activities),
      select(fromActivityReducer.selectAll)
    );

    this.bestEfforts$ = this.activities$.pipe(
      map((activities) => this.calculateBestEfforts(activities))
    );

    // Generate power curve data
    combineLatest([this.bestEfforts$, this.activities$]).subscribe(([bestEfforts, activities]) => {
      if (bestEfforts.length > 0 && activities.length > 0) {
        this.powerCurveData = this.generatePowerCurveData(bestEfforts, activities);
      }
    });
  }

  ngOnInit(): void {
    this.calculatePowerZones();
    this.loadFtpHistory();

    // Calculate estimated FTP from activities
    this.activities$.subscribe((activities) => {
      if (activities.length > 0) {
        this.calculateEstimatedFTP(activities);
      }
    });
  }

  saveFTP(): void {
    // Save current FTP
    localStorage.setItem('user-ftp', this.userFTP.toString());

    // Add to history if value changed
    const lastEntry = this.ftpHistory[this.ftpHistory.length - 1];
    if (!lastEntry || lastEntry.ftp !== this.userFTP) {
      this.ftpHistory.push({
        date: new Date(),
        ftp: this.userFTP,
      });

      // Save history
      localStorage.setItem('ftp-history', JSON.stringify(this.ftpHistory));
    }

    // Recalculate power zones
    this.calculatePowerZones();
  }

  calculatePowerZones(): void {
    this.powerZones = [
      { name: 'Active Recovery', min: 0, max: this.userFTP * 0.55, color: '#BABABA' },
      { name: 'Endurance', min: this.userFTP * 0.56, max: this.userFTP * 0.75, color: '#59ACFF' },
      { name: 'Tempo', min: this.userFTP * 0.76, max: this.userFTP * 0.9, color: '#14D100' },
      { name: 'Threshold', min: this.userFTP * 0.91, max: this.userFTP * 1.05, color: '#FFBD21' },
      { name: 'VO2 Max', min: this.userFTP * 1.06, max: this.userFTP * 1.2, color: '#FF5613' },
      { name: 'Anaerobic', min: this.userFTP * 1.21, max: this.userFTP * 1.5, color: '#F01068' },
      {
        name: 'Neuromuscular',
        min: this.userFTP * 1.51,
        max: Number.MAX_SAFE_INTEGER,
        color: '#810094',
      },
    ];
  }

  calculateBestEfforts(activities: FitActivity[]): BestEffort[] {
    // Start time measurement for performance logging
    const startTime = performance.now();

    const efforts: BestEffort[] = [];

    // For each time period, find the best effort across all activities
    this.timePeriods.forEach((period) => {
      let bestPower = 0;
      let bestDate: Date | undefined = undefined;
      let bestActivityId: string | undefined = undefined;

      activities.forEach((activity) => {
        // Use memoized version for better performance
        const power = this.memoizedBestEffort(activity.powerData, period.seconds);
        if (power > bestPower) {
          bestPower = power;
          bestDate = activity.date;
          bestActivityId = activity.id;
        }
      });

      efforts.push({
        duration: period.seconds,
        durationLabel: period.label,
        power: Math.round(bestPower),
        date: bestDate,
        activityId: bestActivityId,
      });
    });

    // Log performance
    console.debug(`Best efforts calculation took ${performance.now() - startTime}ms`);

    return efforts;
  }

  findBestEffortForPeriod(powerData: PowerData[], durationSeconds: number): number {
    if (!powerData || powerData.length === 0) return 0;

    // If looking for 1 second power, just find the max
    if (durationSeconds === 1) {
      return Math.max(...powerData.map((p) => p.power));
    }

    let maxAvgPower = 0;
    const pointsNeeded = durationSeconds; // Assuming 1 data point per second

    // Sliding window to find best average
    for (let i = 0; i <= powerData.length - pointsNeeded; i++) {
      let sum = 0;
      for (let j = 0; j < pointsNeeded; j++) {
        sum += powerData[i + j].power;
      }
      const avgPower = sum / pointsNeeded;
      if (avgPower > maxAvgPower) {
        maxAvgPower = avgPower;
      }
    }

    return maxAvgPower;
  }

  generatePowerCurveData(bestEfforts: BestEffort[], activities: FitActivity[]): any[] {
    const result = [
      {
        name: 'Best Efforts',
        series: bestEfforts.map((effort) => ({
          name: effort.durationLabel,
          value: effort.power,
        })),
      },
    ];

    // Add latest activity data if available
    if (activities.length > 0) {
      const latestActivity = activities.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];

      const latestSeries = this.timePeriods.map((period) => {
        const power = this.findBestEffortForPeriod(latestActivity.powerData, period.seconds);
        return {
          name: period.label,
          value: Math.round(power),
        };
      });

      result.push({
        name: 'Latest Activity',
        series: latestSeries,
      });
    }

    return result;
  }

  // Format power zone for display
  formatPowerZone(min: number, max: number): string {
    if (max === Number.MAX_SAFE_INTEGER) {
      return `${Math.round(min)}+ W`;
    }
    return `${Math.round(min)}-${Math.round(max)} W`;
  }

  // Get appropriate power zone for a given power value
  getPowerZone(power: number): PowerZone {
    return (
      this.powerZones.find((zone) => power >= zone.min && power <= zone.max) || this.powerZones[0]
    );
  }

  // Load FTP history from localStorage
  loadFtpHistory(): void {
    this.isLoading = true;

    const historyStr = localStorage.getItem('ftp-history');
    if (historyStr) {
      try {
        const history = JSON.parse(historyStr);
        // Convert string dates back to Date objects
        this.ftpHistory = history.map((item: any) => ({
          date: new Date(item.date),
          ftp: item.ftp,
        }));
        this.isLoading = false;
        this.cdr.markForCheck();
      } catch (e) {
        console.error('Error loading FTP history', e);
        this.ftpHistory = [];
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    } else {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  // Calculate estimated FTP based on 20-minute best effort (95% of 20-min power)
  calculateEstimatedFTP(activities: FitActivity[]): number {
    if (!activities || activities.length === 0) {
      console.debug('No activities available for FTP estimation');
      return 0;
    }

    const twentyMinPeriod = this.timePeriods.find((p) => p.seconds === 1200);
    if (!twentyMinPeriod) {
      console.debug('20-min period not found in time periods');
      return 0;
    }

    let bestPower = 0;

    activities.forEach((activity) => {
      if (!activity.powerData || activity.powerData.length === 0) {
        return; // Skip activities without power data
      }

      try {
        const power = this.findBestEffortForPeriod(activity.powerData, 1200);
        if (power > bestPower) {
          bestPower = power;
        }
      } catch (error) {
        console.error('Error calculating power for activity:', error);
      }
    });

    if (bestPower <= 0) {
      console.debug('No valid power data found for 20-min efforts');
      return 0;
    }

    return Math.round(bestPower * 0.95);
  }

  // Calculate FTP based on the last 10 rides
  calculateFTPFromLastRides(activities: FitActivity[]): number {
    if (!activities || activities.length === 0) {
      console.debug('No activities available for last 10 rides FTP calculation');
      return 0;
    }

    // Sort activities by date (newest first)
    const sortedActivities = [...activities].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Take last 10 rides or as many as are available
    const recentActivities = sortedActivities.slice(0, 10);

    if (recentActivities.length === 0) {
      console.debug('No recent activities found after sorting');
      return 0;
    }

    console.debug(`Found ${recentActivities.length} recent activities for FTP calculation`);

    // Calculate estimated FTP for each activity
    const ftpValues = recentActivities
      .map((activity) => {
        if (!activity.powerData || activity.powerData.length === 0) {
          return 0; // Skip activities without power data
        }

        try {
          const twentyMinPower = this.findBestEffortForPeriod(activity.powerData, 1200);
          return twentyMinPower > 0 ? Math.round(twentyMinPower * 0.95) : 0;
        } catch (error) {
          console.error('Error calculating FTP for activity:', error);
          return 0;
        }
      })
      .filter((value) => value > 0);

    if (ftpValues.length === 0) {
      console.debug('No valid FTP values calculated from recent activities');
      return 0;
    }

    console.debug(`Calculated FTP values: ${ftpValues.join(', ')}`);

    // Return the highest value
    return Math.max(...ftpValues);
  }

  // Set active section
  setActiveSection(section: string): void {
    this.activeSection = section;

    // Lazy load FTP history data only when needed
    if (section === 'ftp' && !this.ftpHistoryLoaded) {
      this.loadFtpHistory();
      this.ftpHistoryLoaded = true;
    }

    this.cdr.markForCheck();
  }

  // Generate FTP history chart data
  getFtpChartData(): any[] {
    if (this.ftpHistory.length === 0) return [];

    const data = [
      {
        name: 'FTP History',
        series: this.ftpHistory.map((item) => ({
          name: new Date(item.date).toLocaleDateString(),
          value: item.ftp,
        })),
      },
    ];

    return this.optimizePowerCurveData(data);
  }

  // Reduce the data points for power curve to improve performance
  optimizePowerCurveData(data: any[]): any[] {
    // If data is small, don't optimize
    if (!data[0] || data[0].series.length < 200) return data;

    return data.map((dataset) => {
      // If we have too many points, sample them
      if (dataset.series.length > 200) {
        const samplingRate = Math.ceil(dataset.series.length / 200);
        const optimizedSeries = dataset.series.filter(
          (_: any, i: number) => i % samplingRate === 0
        );

        return {
          ...dataset,
          series: optimizedSeries,
        };
      }
      return dataset;
    });
  }

  // Update the getPowerCurveData method to use this optimization
  getPowerCurveData(bestEfforts: BestEffort[]): any[] {
    // Existing code to generate data
    const data = [
      {
        name: 'Power Curve',
        series: bestEfforts.map((effort) => ({
          name: effort.durationLabel,
          value: effort.power,
        })),
      },
    ];

    // Return optimized data
    return this.optimizePowerCurveData(data);
  }
}
