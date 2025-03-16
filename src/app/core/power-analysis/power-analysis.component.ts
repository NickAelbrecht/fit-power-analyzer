import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store, select } from '@ngrx/store';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { Observable, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';
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

  // FTP settings with safe localStorage access
  userFTP = 250; // Default value

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
    { seconds: 7200, label: '2 hours' },
    { seconds: 10800, label: '3 hours' },
    { seconds: 14400, label: '4 hours' },
  ];

  // Chart options for power curve
  powerCurveData: any[] = [];
  view: [number, number] = [500, 350]; // Adjusted dimensions for side-by-side layout
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
  ftpHistory: { date: Date; ftp: number; activityName?: string; source?: string }[] = [];
  activityFtpEstimates: { date: Date; ftp: number; activityName: string; source: string }[] = [];

  // Add this property to track if FTP data is loaded
  private ftpHistoryLoaded = false;

  // Correctly bind "this" context to memoized functions
  private memoizedBestEffort: Function;
  private memoizedLastRidesFTP: Function;
  private memoizedEstimatedFTP: Function;

  // Add loading state
  isLoading = false;

  constructor(
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Initialize the memoized functions with correct bindings
    this.memoizedBestEffort = memoize(this.findBestEffortForPeriod.bind(this));
    this.memoizedLastRidesFTP = memoize(this.calculateFTPFromLastRides.bind(this));
    this.memoizedEstimatedFTP = memoize(this.calculateEstimatedFTP.bind(this));

    // Initialize FTP from localStorage only in browser context
    if (isPlatformBrowser(this.platformId)) {
      this.userFTP = localStorage.getItem('user-ftp')
        ? Number(localStorage.getItem('user-ftp'))
        : 250;
    }

    // Directly access the activities state like the activity-list component does
    this.activities$ = this.store.pipe(
      select((state) => state.activities),
      select(fromActivityReducer.selectAll),
      tap((activities) => {
        // Debug logs matching activity-list.component.ts
        console.log('Power Analysis - Activities loaded:', activities.length);
        if (activities.length > 0) {
          console.log('Power Analysis - First activity:', activities[0]);
        }
      })
    );

    this.bestEfforts$ = this.activities$.pipe(
      map((activities) => {
        if (!activities || activities.length === 0) {
          console.log('Power Analysis - No activities available for best efforts calculation');
          return [];
        }

        // Log cycling activities specifically (as these are most relevant for power analysis)
        const cyclingActivities = activities.filter((a) => a.type.toLowerCase() === 'cycling');
        console.log('Power Analysis - Cycling activities:', cyclingActivities.length);

        return this.calculateBestEfforts(activities);
      })
    );

    // Generate power curve data with improved logging
    combineLatest([this.bestEfforts$, this.activities$]).subscribe(([bestEfforts, activities]) => {
      console.log(
        'Power Analysis - Generating power curve data. Best efforts:',
        bestEfforts?.length || 0,
        'Activities:',
        activities?.length || 0
      );

      if (bestEfforts && activities && bestEfforts.length > 0 && activities.length > 0) {
        this.powerCurveData = this.generatePowerCurveData(bestEfforts, activities);
        console.log('Power Analysis - Power curve data generated:', this.powerCurveData);
      } else {
        console.log('Power Analysis - Not enough data to generate power curve');
      }
    });
  }

  ngOnInit(): void {
    console.log('Power Analysis - Component initialized');
    this.calculatePowerZones();
    this.loadFtpHistory();

    // Calculate estimated FTP from activities and build activity-based FTP history
    this.activities$.subscribe((activities) => {
      console.log('Power Analysis - Activities for FTP calculation:', activities.length);
      if (activities.length > 0) {
        const ftp = this.calculateEstimatedFTP(activities);
        console.log('Power Analysis - Estimated FTP:', ftp);

        // Generate FTP estimates for all activities with power data
        this.generateActivityFtpEstimates(activities);
      }
    });
  }

  saveFTP(): void {
    // Only save to localStorage in browser context
    if (isPlatformBrowser(this.platformId)) {
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
    // Add null check
    if (!activities || activities.length === 0) {
      console.debug('Power Analysis - No activities for best efforts calculation');
      return [];
    }

    console.debug(`Power Analysis - Calculating best efforts for ${activities.length} activities`);

    // Start time measurement for performance logging
    const startTime = performance.now();

    const efforts: BestEffort[] = [];

    // Filter activities with power data to avoid unnecessary processing
    const activitiesWithPower = activities.filter(
      (activity) => activity && activity.powerData && activity.powerData.length > 0
    );

    console.debug(`Power Analysis - ${activitiesWithPower.length} activities have power data`);

    // Log activity lengths to help debug long-duration issues
    const activityLengths = activitiesWithPower.map((activity) => ({
      name: activity.name,
      type: activity.type,
      dataPoints: activity.powerData.length,
      durationHours: activity.totalTime ? (activity.totalTime / 3600).toFixed(1) : 'unknown',
    }));

    // Sort by duration (longest first) and log the top 5
    const longestActivities = [...activityLengths]
      .sort((a, b) => Number(b.dataPoints) - Number(a.dataPoints))
      .slice(0, 5);

    console.debug('Power Analysis - Longest activities available:');
    longestActivities.forEach((activity, index) => {
      console.debug(
        `Power Analysis - Activity ${index + 1}: ${activity.name}, Type: ${activity.type}, Duration: ~${activity.durationHours}h (${activity.dataPoints} points)`
      );
    });

    // For each time period, find the best effort across all activities
    this.timePeriods.forEach((period) => {
      console.debug(
        `Power Analysis - Calculating best effort for period: ${period.label} (${period.seconds}s)`
      );

      let bestPower = 0;
      let bestDate: Date | undefined = undefined;
      let bestActivityId: string | undefined = undefined;
      let bestActivityName: string | undefined = undefined;

      // For longer durations, only process activities that are long enough
      let eligibleActivities = activitiesWithPower;

      // For very long durations, filter to only activities that are long enough to have the effort
      // Match the required ratios used in findBestEffortForPeriod
      if (period.seconds >= 3600) {
        // Get the appropriate required ratio based on duration
        const requiredDataRatio =
          period.seconds >= 10800
            ? 0.5 // 3+ hours: only need 50%
            : period.seconds >= 7200
              ? 0.55 // 2+ hours: need 55%
              : period.seconds >= 3600
                ? 0.6 // 1+ hour: need 60%
                : 0.7; // 20 min+: need 70%

        const minRequiredLength = Math.floor(period.seconds * requiredDataRatio);
        eligibleActivities = activitiesWithPower.filter(
          (activity) => activity.powerData && activity.powerData.length >= minRequiredLength
        );

        console.debug(
          `Power Analysis - For ${period.label} effort, found ${eligibleActivities.length} activities with sufficient length (needed ${requiredDataRatio * 100}% or ${minRequiredLength} points)`
        );

        // Log the eligible activities for debugging long-duration issues
        eligibleActivities.forEach((activity, index) => {
          console.debug(
            `Power Analysis - Eligible for ${period.label}: ${activity.name}, Length: ${activity.powerData.length} points`
          );
        });
      }

      // Calculate best effort for this period across all eligible activities
      eligibleActivities.forEach((activity) => {
        try {
          // Use memoized version for better performance
          const power = this.memoizedBestEffort(activity.powerData, period.seconds);
          if (power > 0) {
            console.debug(
              `Power Analysis - ${activity.name} ${period.label} power: ${Math.round(power)}W`
            );
          }

          if (power > bestPower) {
            bestPower = power;
            bestDate = activity.date;
            bestActivityId = activity.id;
            bestActivityName = activity.name;
          }
        } catch (error) {
          console.error(
            `Power Analysis - Error calculating ${period.label} for ${activity.name}:`,
            error
          );
        }
      });

      console.debug(
        `Power Analysis - Best ${period.label} effort: ${Math.round(bestPower)}W ${bestActivityName ? `(from ${bestActivityName})` : ''}`
      );

      efforts.push({
        duration: period.seconds,
        durationLabel: period.label,
        power: Math.round(bestPower),
        date: bestDate,
        activityId: bestActivityId,
      });
    });

    // Log performance
    console.debug(
      `Power Analysis - Best efforts calculation took ${(performance.now() - startTime).toFixed(0)}ms`
    );

    return efforts;
  }

  findBestEffortForPeriod(powerData: PowerData[], durationSeconds: number): number {
    try {
      console.debug(
        `Power Analysis - Finding best effort for period of ${durationSeconds} seconds`
      );

      // Validate power data
      if (!powerData || !Array.isArray(powerData)) {
        console.debug('Power Analysis - Invalid power data (not an array)');
        return 0;
      }

      // Enhanced logging for longer durations
      if (durationSeconds >= 3600) {
        console.debug(
          `Power Analysis - Processing ${durationSeconds / 3600}h duration with ${powerData.length} data points`
        );
        console.debug(
          `Power Analysis - Data coverage: ${((powerData.length / durationSeconds) * 100).toFixed(1)}% of required duration`
        );
      }

      // Special case for 1-second power (max power)
      if (durationSeconds === 1 && powerData.length > 0) {
        // Find the maximum power value from valid data points
        let maxPower = 0;
        for (const point of powerData) {
          if (
            point &&
            typeof point.power === 'number' &&
            isFinite(point.power) &&
            !isNaN(point.power)
          ) {
            maxPower = Math.max(maxPower, point.power);
          }
        }
        console.debug(`Power Analysis - Max 1-second power: ${maxPower}W`);
        return maxPower;
      }

      // For very long durations, be more lenient with data requirements
      const isVeryLongDuration = durationSeconds >= 3600; // 1+ hour
      const isLongDuration = durationSeconds >= 1200; // 20+ min

      // Check if we have sufficient data length for this duration
      // Be very lenient for long durations to ensure we get results
      const requiredDataRatio =
        durationSeconds >= 10800
          ? 0.5 // 3+ hours: only need 50%
          : durationSeconds >= 3600
            ? 0.6 // 1+ hour: only need 60%
            : durationSeconds >= 1200
              ? 0.7 // 20 min: need 70%
              : 0.9; // Otherwise: need 90%

      const minRequiredPoints = Math.floor(durationSeconds * requiredDataRatio);

      if (powerData.length < minRequiredPoints) {
        console.debug(
          `Power Analysis - Not enough data points (${powerData.length}) for duration ${durationSeconds}s (need ${minRequiredPoints})`
        );
        return 0;
      }

      // Count valid power values to ensure we have enough non-zero data
      let validCount = 0;
      let zeroCount = 0;
      let nanCount = 0;
      let totalSum = 0;

      for (let i = 0; i < Math.min(powerData.length, 1000); i++) {
        const point = powerData[i];
        if (point && typeof point.power === 'number') {
          if (point.power > 0 && isFinite(point.power) && !isNaN(point.power)) {
            validCount++;
            totalSum += point.power;
          } else if (point.power === 0) {
            zeroCount++;
          } else {
            nanCount++;
          }
        }
      }

      // Log data quality stats for longer durations
      if (durationSeconds >= 3600) {
        const sampleSize = Math.min(powerData.length, 1000);
        console.debug(`Power Analysis - Data quality (sample of ${sampleSize} points):`);
        console.debug(
          `Power Analysis - Valid values: ${validCount} (${((validCount / sampleSize) * 100).toFixed(1)}%)`
        );
        console.debug(
          `Power Analysis - Zero values: ${zeroCount} (${((zeroCount / sampleSize) * 100).toFixed(1)}%)`
        );
        console.debug(
          `Power Analysis - Invalid values: ${nanCount} (${((nanCount / sampleSize) * 100).toFixed(1)}%)`
        );

        if (validCount > 0) {
          console.debug(
            `Power Analysis - Average of valid values: ${(totalSum / validCount).toFixed(1)}W`
          );
        }

        // If we have too many zeros or invalid values, we might need to apply filtering
        if (validCount < sampleSize * 0.7) {
          console.debug(`Power Analysis - Warning: Low percentage of valid power values`);
        }
      }

      // Replace invalid power values with small positive value instead of 0
      // This helps with the sliding window calculation for longer durations
      const validatedPowerData = powerData.map((point) => {
        if (!point) return { timestamp: new Date(0), power: 1 };
        if (typeof point.power !== 'number' || isNaN(point.power) || !isFinite(point.power)) {
          return { timestamp: point.timestamp, power: 1 };
        }
        // Keep positive power values, replace 0 or negative with 1W
        return { timestamp: point.timestamp, power: point.power > 0 ? point.power : 1 };
      });

      // Special handling for multi-hour durations
      if (isVeryLongDuration) {
        console.debug(`Power Analysis - Processing ${durationSeconds / 3600}h duration effort`);
      }

      // Calculate basic stats for debugging
      let sumPower = 0;
      let maxPower = 0;
      let minPower = Number.MAX_VALUE;

      for (const point of validatedPowerData) {
        sumPower += point.power;
        maxPower = Math.max(maxPower, point.power);
        minPower = Math.min(minPower, point.power);
      }

      const avgPower = sumPower / validatedPowerData.length;

      console.debug(
        `Power Analysis - Power summary: avg=${avgPower.toFixed(1)}W, min=${minPower}W, max=${maxPower}W, points=${validatedPowerData.length}`
      );

      // For longer efforts, use sampling to improve performance and handle data gaps better
      const samplingFactor =
        durationSeconds >= 10800
          ? 5 // 3+ hours: sample every 5 seconds
          : durationSeconds >= 7200
            ? 3 // 2+ hours: sample every 3 seconds
            : durationSeconds >= 3600
              ? 2 // 1+ hour: sample every 2 seconds
              : 1; // Otherwise: use all data points

      // For long durations, try a more robust approach that can handle data gaps better
      if (durationSeconds >= 3600) {
        const result = this.calculateLongDurationBestEffort(validatedPowerData, durationSeconds);
        if (result > 0) {
          console.debug(
            `Power Analysis - Using robust calculation for ${durationSeconds}s: ${result.toFixed(1)}W`
          );
          return result;
        }
        console.debug(
          `Power Analysis - Robust calculation failed, falling back to standard method`
        );
      }

      // Only apply sampling for long durations with lots of data points
      if (samplingFactor > 1 && validatedPowerData.length > durationSeconds) {
        return this.calculateBestEffortWithSampling(
          validatedPowerData,
          durationSeconds,
          samplingFactor
        );
      } else {
        return this.calculateBestEffortStandard(validatedPowerData, durationSeconds);
      }
    } catch (error) {
      console.error(`Power Analysis - Error in findBestEffortForPeriod: ${error}`);
      return 0;
    }
  }

  // New method: More robust approach for long duration efforts that might have data gaps
  private calculateLongDurationBestEffort(
    powerData: { timestamp: Date | number; power: number }[],
    durationSeconds: number
  ): number {
    try {
      console.debug(
        `Power Analysis - Using robust long-duration calculation for ${durationSeconds}s`
      );

      // Need at least this many consecutive valid power readings
      const minValidWindowSize = Math.floor(durationSeconds * 0.4);

      // Use a different approach to find the best window
      let bestAvgPower = 0;
      let windowSize = 0;
      let windowSum = 0;
      let maxValidWindowSize = 0;

      // Try with larger chunks of data
      for (let i = 0; i < powerData.length - minValidWindowSize; i++) {
        // Reset window for each starting position
        windowSize = 0;
        windowSum = 0;

        // Build window forward from current position
        for (let j = i; j < Math.min(i + durationSeconds * 2, powerData.length); j++) {
          if (!powerData[j] || powerData[j].power <= 0) continue;

          windowSum += powerData[j].power;
          windowSize++;

          // If we have enough data points for a valid window, check if it's the best
          if (windowSize >= minValidWindowSize) {
            const avgPower = windowSum / windowSize;

            // If this is close to our target duration and better than previous best
            if (
              windowSize > maxValidWindowSize ||
              (windowSize >= maxValidWindowSize && avgPower > bestAvgPower)
            ) {
              maxValidWindowSize = windowSize;
              bestAvgPower = avgPower;
            }

            // If we've collected enough data points, move to next starting position
            if (windowSize >= durationSeconds) break;
          }
        }
      }

      console.debug(
        `Power Analysis - Robust method found window of ${maxValidWindowSize} points with avg ${bestAvgPower.toFixed(1)}W`
      );

      // Only return a value if we found a reasonable window
      if (maxValidWindowSize >= minValidWindowSize) {
        return bestAvgPower;
      }

      return 0; // Not enough valid data
    } catch (error) {
      console.error(`Power Analysis - Error in calculateLongDurationBestEffort: ${error}`);
      return 0;
    }
  }

  // Helper method for calculating best effort with data sampling
  private calculateBestEffortWithSampling(
    powerData: { timestamp: Date | number; power: number }[],
    durationSeconds: number,
    samplingFactor: number
  ): number {
    // Sample the data to reduce computational load
    const sampledData = powerData.filter((_, index) => index % samplingFactor === 0);

    console.debug(
      `Power Analysis - Using sampling (1/${samplingFactor}) for ${durationSeconds}s calculation, reduced from ${powerData.length} to ${sampledData.length} points`
    );

    // Adjust duration for sampled data
    const sampledDuration = Math.ceil(durationSeconds / samplingFactor);

    if (sampledData.length <= sampledDuration) {
      console.debug(`Power Analysis - After sampling, not enough data points remain`);
      return 0;
    }

    // Standard sliding window on sampled data
    let bestAvgPower = 0;
    let windowSum = 0;

    // Initialize the first window
    for (let i = 0; i < sampledDuration; i++) {
      windowSum += sampledData[i].power;
    }

    bestAvgPower = windowSum / sampledDuration;

    // Slide the window
    for (let i = sampledDuration; i < sampledData.length; i++) {
      windowSum = windowSum - sampledData[i - sampledDuration].power + sampledData[i].power;
      const windowAvg = windowSum / sampledDuration;
      bestAvgPower = Math.max(bestAvgPower, windowAvg);
    }

    console.debug(
      `Power Analysis - Best ${durationSeconds}s power (with sampling): ${bestAvgPower.toFixed(1)}W`
    );
    return bestAvgPower;
  }

  // Helper method for standard calculation without sampling
  private calculateBestEffortStandard(
    powerData: { timestamp: Date | number; power: number }[],
    durationSeconds: number
  ): number {
    console.debug(`Power Analysis - Using standard calculation for ${durationSeconds}s effort`);

    // Standard sliding window calculation
    let bestAvgPower = 0;
    let windowSum = 0;

    // Special case: if we don't have enough points, use what we have
    const windowSize = Math.min(durationSeconds, powerData.length);

    // Initialize the first window
    for (let i = 0; i < windowSize; i++) {
      windowSum += powerData[i].power;
    }

    bestAvgPower = windowSum / windowSize;

    // Slide the window if we have more data than the window size
    if (powerData.length > windowSize) {
      for (let i = windowSize; i < powerData.length; i++) {
        windowSum = windowSum - powerData[i - windowSize].power + powerData[i].power;
        const windowAvg = windowSum / windowSize;
        bestAvgPower = Math.max(bestAvgPower, windowAvg);
      }
    }

    console.debug(`Power Analysis - Best ${durationSeconds}s power: ${bestAvgPower.toFixed(1)}W`);
    return bestAvgPower;
  }

  generatePowerCurveData(bestEfforts: BestEffort[], activities: FitActivity[]): any[] {
    // Add null checks
    if (!bestEfforts || bestEfforts.length === 0 || !activities || activities.length === 0) {
      return [];
    }

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

      // Check if the latest activity has power data
      if (latestActivity && latestActivity.powerData && latestActivity.powerData.length > 0) {
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

    if (isPlatformBrowser(this.platformId)) {
      const historyStr = localStorage.getItem('ftp-history');
      if (historyStr) {
        try {
          const history = JSON.parse(historyStr);
          // Convert string dates back to Date objects
          this.ftpHistory = history.map((item: any) => ({
            date: new Date(item.date),
            ftp: item.ftp,
          }));
        } catch (e) {
          console.error('Error loading FTP history', e);
          this.ftpHistory = [];
        }
      }
    }

    this.isLoading = false;
    this.cdr.markForCheck();
  }

  // Calculate FTP based on the last 10 rides
  calculateFTPFromLastRides(activities: FitActivity[]): number {
    try {
      if (!activities || !Array.isArray(activities) || activities.length === 0) {
        console.debug('Power Analysis - No activities available for last 10 rides FTP calculation');
        return 0;
      }

      console.debug(
        `Power Analysis - Calculating FTP from last 10 rides out of ${activities.length} total activities`
      );

      // Log all activities to debug what we're working with
      activities.forEach((activity, index) => {
        if (activity && activity.powerData) {
          console.debug(
            `Power Analysis - Activity ${index}: ${activity.name}, Type: ${activity.type}, PowerData: ${activity.powerData.length} points`
          );
        } else {
          console.debug(
            `Power Analysis - Activity ${index}: ${activity?.name || 'Unknown'}, No power data`
          );
        }
      });

      // Sort activities by date (newest first)
      const sortedActivities = [...activities].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      console.debug(`Power Analysis - Sorted ${sortedActivities.length} activities by date`);

      // Take last 10 rides that have power data - be less strict with filtering
      const recentActivities = sortedActivities
        .filter((activity) => {
          // Basic existence check
          if (!activity) {
            console.debug('Power Analysis - Skipping undefined activity');
            return false;
          }

          // Check type is cycling (case insensitive)
          const isCycling =
            activity.type &&
            typeof activity.type === 'string' &&
            activity.type.toLowerCase().includes('cycl');
          if (!isCycling) {
            console.debug(`Power Analysis - Skipping non-cycling activity: ${activity.type}`);
            return false;
          }

          // Check power data exists and has points
          const hasPowerData =
            activity.powerData &&
            Array.isArray(activity.powerData) &&
            activity.powerData.length > 0;
          if (!hasPowerData) {
            console.debug(
              `Power Analysis - Skipping activity without power data: ${activity.name}`
            );
            return false;
          }

          return true;
        })
        .slice(0, 10);

      if (recentActivities.length === 0) {
        console.debug(
          'Power Analysis - No recent cycling activities with power data found after filtering'
        );
        return 0;
      }

      console.debug(
        `Power Analysis - Found ${recentActivities.length} recent cycling activities with power data for FTP calculation`
      );

      // Log basic info about each recent activity
      recentActivities.forEach((activity, index) => {
        console.debug(
          `Power Analysis - Recent activity ${index + 1}: ${activity.name}, Date: ${new Date(activity.date).toLocaleDateString()}, Points: ${activity.powerData.length}, Avg Power: ${activity.avgPower}W`
        );
      });

      // Use normalized power for activities without enough data for 20-min power
      const ftpValues = recentActivities
        .map((activity) => {
          try {
            // First try normalized power if available
            if (activity.normalizedPower && activity.normalizedPower > 0) {
              const ftpEstimate = Math.round(activity.normalizedPower * 0.76);
              console.debug(
                `Power Analysis - Using normalized power estimate for activity ${activity.name}: ${ftpEstimate}W (from NP: ${activity.normalizedPower}W)`
              );
              return { value: ftpEstimate, source: 'NP', activity: activity.name };
            }

            // Then try 20-min best effort if enough data
            if (activity.powerData && activity.powerData.length >= 1200) {
              const twentyMinPower = this.findBestEffortForPeriod(activity.powerData, 1200);
              if (twentyMinPower > 0) {
                const ftpEstimate = Math.round(twentyMinPower * 0.95);
                console.debug(
                  `Power Analysis - Calculated FTP estimate for activity ${activity.name}: ${ftpEstimate}W (from 20min power: ${Math.round(twentyMinPower)}W)`
                );
                return { value: ftpEstimate, source: '20min', activity: activity.name };
              }
            }

            // If both previous methods fail, try using average power
            if (activity.avgPower && activity.avgPower > 0) {
              // Using 90% of average power as a fallback for shorter activities
              const ftpEstimate = Math.round(activity.avgPower * 0.9);
              console.debug(
                `Power Analysis - Using average power fallback for activity ${activity.name}: ${ftpEstimate}W (from avg: ${activity.avgPower}W)`
              );
              return { value: ftpEstimate, source: 'avg', activity: activity.name };
            }

            console.debug(
              `Power Analysis - No valid power data for FTP calculation in activity: ${activity.name}`
            );
            return { value: 0, source: 'none', activity: activity.name };
          } catch (error) {
            console.error(
              `Power Analysis - Error calculating FTP for activity ${activity.id}:`,
              error
            );
            return { value: 0, source: 'error', activity: activity.name };
          }
        })
        .filter((result) => result.value > 0);

      if (ftpValues.length === 0) {
        console.debug('Power Analysis - No valid FTP values calculated from recent activities');
        return 0;
      }

      // Log calculated FTP values for debugging
      console.debug(`Power Analysis - Calculated ${ftpValues.length} FTP values from activities:`);
      ftpValues.forEach((result) => {
        console.debug(
          `Power Analysis - ${result.activity}: ${result.value}W (source: ${result.source})`
        );
      });

      // Return the highest value - use for loop to avoid spread operator
      let maxFtp = 0;
      let bestActivityName = '';
      for (const result of ftpValues) {
        if (result.value > maxFtp) {
          maxFtp = result.value;
          bestActivityName = result.activity;
        }
      }

      console.debug(`Power Analysis - Highest FTP estimate: ${maxFtp}W from ${bestActivityName}`);
      return maxFtp;
    } catch (err) {
      console.error('Power Analysis - Error in calculateFTPFromLastRides:', err);
      return 0;
    }
  }

  // Calculate estimated FTP based on 20-minute best effort (95% of 20-min power)
  calculateEstimatedFTP(activities: FitActivity[]): number {
    try {
      if (!activities || !Array.isArray(activities) || activities.length === 0) {
        console.debug('Power Analysis - No activities available for FTP estimation');
        return 0;
      }

      console.debug(
        `Power Analysis - Calculating estimated FTP from ${activities.length} activities`
      );

      // Verify timePeriods is accessible
      if (!this.timePeriods) {
        console.error('Power Analysis - timePeriods is undefined in calculateEstimatedFTP');
        return 0;
      }

      // Count cycling activities
      const cyclingActivities = activities.filter(
        (activity) =>
          activity &&
          activity.type &&
          typeof activity.type === 'string' &&
          activity.type.toLowerCase().includes('cycl')
      );

      console.debug(
        `Power Analysis - Found ${cyclingActivities.length} cycling activities out of ${activities.length} total`
      );

      // Be more lenient with data requirements - allow activities with at least 15 minutes of data (900 seconds)
      // instead of requiring the full 20 minutes (1200 seconds)
      const eligibleActivities = cyclingActivities.filter((activity) => {
        if (!activity) return false;

        const hasPowerData =
          activity.powerData &&
          Array.isArray(activity.powerData) &&
          activity.powerData.length >= 900; // At least 15 minutes of data

        if (!hasPowerData) {
          console.debug(
            `Power Analysis - Cycling activity ${activity.name} has insufficient power data: ${activity.powerData?.length || 0} points`
          );
        } else {
          console.debug(
            `Power Analysis - Cycling activity ${activity.name} has ${activity.powerData.length} power data points (sufficient)`
          );
        }

        return hasPowerData;
      });

      console.debug(
        `Power Analysis - ${eligibleActivities.length} cycling activities have sufficient data for 20-min power calculation`
      );

      // Log each eligible activity
      eligibleActivities.forEach((activity, index) => {
        console.debug(
          `Power Analysis - Eligible activity ${index + 1}: ${activity.name}, Duration: ${activity.totalTime}s, Power points: ${activity.powerData.length}, Avg Power: ${activity.avgPower || 0}W`
        );
      });

      // Find the best 20-minute effort across all activities
      let bestPower = 0;
      let bestActivityName = '';

      // First, try with activities that have at least 20 minutes of data
      const activitiesWith20Min = eligibleActivities.filter(
        (activity) => activity.powerData && activity.powerData.length >= 1200
      );

      console.debug(
        `Power Analysis - ${activitiesWith20Min.length} activities have full 20-min data`
      );

      // Try with 20-minute activities first
      activitiesWith20Min.forEach((activity) => {
        try {
          console.debug(`Power Analysis - Calculating 20-min power for activity ${activity.name}`);
          const power = this.findBestEffortForPeriod(activity.powerData, 1200);
          console.debug(
            `Power Analysis - Activity ${activity.name} 20-min power: ${power.toFixed(1)}W`
          );
          if (power > bestPower) {
            bestPower = power;
            bestActivityName = activity.name;
          }
        } catch (error) {
          console.error(
            `Power Analysis - Error calculating power for activity ${activity.id}:`,
            error
          );
        }
      });

      // If we don't have a valid 20-min power, try with 15-min activities
      if (bestPower <= 0 && eligibleActivities.length > activitiesWith20Min.length) {
        console.debug(`Power Analysis - No valid 20-min power found, trying with 15-min data`);

        const activitiesWith15Min = eligibleActivities.filter(
          (activity) =>
            activity.powerData &&
            activity.powerData.length >= 900 &&
            activity.powerData.length < 1200
        );

        activitiesWith15Min.forEach((activity) => {
          try {
            console.debug(
              `Power Analysis - Calculating 15-min power for activity ${activity.name}`
            );
            const power = this.findBestEffortForPeriod(activity.powerData, 900);
            // Apply a small adjustment factor for 15-min vs 20-min
            const adjustedPower = power * 0.97; // 15-min power is typically ~3% higher than 20-min
            console.debug(
              `Power Analysis - Activity ${activity.name} 15-min power: ${power.toFixed(1)}W, adjusted: ${adjustedPower.toFixed(1)}W`
            );
            if (adjustedPower > bestPower) {
              bestPower = adjustedPower;
              bestActivityName = activity.name + ' (15min)';
            }
          } catch (error) {
            console.error(
              `Power Analysis - Error calculating 15-min power for activity ${activity.id}:`,
              error
            );
          }
        });
      }

      if (bestPower <= 0) {
        console.debug('Power Analysis - No valid power data found for 20-min or 15-min efforts');

        // Fallback: try normalized power
        const activitiesWithNP = activities.filter(
          (a) => a && a.normalizedPower && a.normalizedPower > 0
        );
        if (activitiesWithNP.length > 0) {
          // Get highest NP
          let bestNP = 0;
          let bestNPActivity = '';
          activitiesWithNP.forEach((activity) => {
            if (activity.normalizedPower && activity.normalizedPower > bestNP) {
              bestNP = activity.normalizedPower;
              bestNPActivity = activity.name || 'Unknown';
            }
          });

          const ftpEstimate = Math.round(bestNP * 0.76);
          console.debug(
            `Power Analysis - Using fallback NP method: ${ftpEstimate}W from ${bestNPActivity}`
          );
          return ftpEstimate;
        }

        // Second fallback: use 5-min power if available
        console.debug('Power Analysis - Trying fallback to 5-min power');
        let best5MinPower = 0;
        let best5MinActivity = '';

        cyclingActivities.forEach((activity) => {
          if (activity && activity.powerData && activity.powerData.length >= 300) {
            try {
              const power = this.findBestEffortForPeriod(activity.powerData, 300);
              if (power > best5MinPower) {
                best5MinPower = power;
                best5MinActivity = activity.name;
              }
            } catch (error) {
              console.error(`Power Analysis - Error calculating 5-min power:`, error);
            }
          }
        });

        if (best5MinPower > 0) {
          // Use 85% of 5-min power as FTP estimate (rough approximation)
          const ftpEstimate = Math.round(best5MinPower * 0.85);
          console.debug(
            `Power Analysis - Using 5-min power fallback: ${ftpEstimate}W from ${best5MinActivity}`
          );
          return ftpEstimate;
        }

        return 0;
      }

      const estimatedFTP = Math.round(bestPower * 0.95);
      console.debug(
        `Power Analysis - Best 20-min power: ${bestPower.toFixed(1)}W from ${bestActivityName}, Estimated FTP: ${estimatedFTP}W`
      );

      return estimatedFTP;
    } catch (err) {
      console.error('Power Analysis - Error in calculateEstimatedFTP:', err);
      return 0;
    }
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
    // If we have no manual entries and no activity estimates, return empty
    if (this.ftpHistory.length === 0 && this.activityFtpEstimates.length === 0) return [];

    const combinedHistory = this.getCombinedFtpHistory();

    const data = [
      {
        name: 'FTP History',
        series: combinedHistory.map((item) => {
          // Format the date without time for better readability
          const date = new Date(item.date);
          const formattedDate = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

          return {
            name: formattedDate,
            value: item.ftp,
          };
        }),
      },
    ];

    return this.optimizePowerCurveData(data);
  }

  // Get combined history from manual entries and activity estimates
  getCombinedFtpHistory(): { date: Date; ftp: number; activityName?: string; source?: string }[] {
    // If we only have manual entries, return those
    if (this.activityFtpEstimates.length === 0) {
      return [...this.ftpHistory];
    }

    // If we only have activity estimates, return those
    if (this.ftpHistory.length === 0) {
      // Return just the last 10 activity estimates
      return this.activityFtpEstimates.slice(0, 10);
    }

    // We have both, so combine them
    const combined = [...this.ftpHistory, ...this.activityFtpEstimates];

    // Sort by date (newest first)
    combined.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Take the 10 most recent entries
    return combined.slice(0, 10);
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

  // Use this wrapper method in the template
  getEstimatedFTPFromLastRides(activities: FitActivity[]): number {
    try {
      const result = this.memoizedLastRidesFTP(activities);
      console.debug(
        `Power Analysis - getEstimatedFTPFromLastRides called for template: ${result}W`
      );
      return result;
    } catch (err) {
      console.error('Power Analysis - Error in getEstimatedFTPFromLastRides:', err);
      return 0;
    }
  }

  // Use this wrapper method in the template
  getEstimatedFTPFrom20Min(activities: FitActivity[]): number {
    try {
      const result = this.memoizedEstimatedFTP(activities);
      console.debug(`Power Analysis - getEstimatedFTPFrom20Min called for template: ${result}W`);
      return result;
    } catch (err) {
      console.error('Power Analysis - Error in getEstimatedFTPFrom20Min:', err);
      return 0;
    }
  }

  // New method to generate FTP estimates from all activities for the history chart/table
  generateActivityFtpEstimates(activities: FitActivity[]): void {
    if (!activities || activities.length === 0) return;

    console.debug(`Power Analysis - Generating FTP estimates for ${activities.length} activities`);

    // Sort activities by date (newest first)
    const sortedActivities = [...activities].sort((a, b) => {
      if (!a.date || !b.date) return 0;
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Filter to cycling activities with power data
    const cyclingActivities = sortedActivities.filter((activity) => {
      // Basic existence check
      if (!activity) return false;

      // Check type is cycling (case insensitive)
      const isCycling =
        activity.type &&
        typeof activity.type === 'string' &&
        activity.type.toLowerCase().includes('cycl');
      if (!isCycling) return false;

      // Check power data exists and has points
      const hasPowerData =
        activity.powerData && Array.isArray(activity.powerData) && activity.powerData.length > 0;
      if (!hasPowerData) return false;

      return true;
    });

    // Clear previous estimates
    this.activityFtpEstimates = [];

    // Process each activity to get an FTP estimate
    cyclingActivities.forEach((activity) => {
      try {
        let ftpEstimate = 0;
        let source = '';

        // First try 20-min best effort if enough data
        if (activity.powerData && activity.powerData.length >= 1200) {
          const twentyMinPower = this.findBestEffortForPeriod(activity.powerData, 1200);
          if (twentyMinPower > 0) {
            ftpEstimate = Math.round(twentyMinPower * 0.95);
            source = '20min';
          }
        }

        // Then try normalized power if available and 20-min method failed
        if (ftpEstimate <= 0 && activity.normalizedPower && activity.normalizedPower > 0) {
          ftpEstimate = Math.round(activity.normalizedPower * 0.76);
          source = 'NP';
        }

        // If both previous methods fail, try using average power
        if (ftpEstimate <= 0 && activity.avgPower && activity.avgPower > 0) {
          ftpEstimate = Math.round(activity.avgPower * 0.9);
          source = 'avg';
        }

        // Add to estimates if we got a valid value
        if (ftpEstimate > 0) {
          this.activityFtpEstimates.push({
            date: new Date(activity.date),
            ftp: ftpEstimate,
            activityName: activity.name || 'Unknown activity',
            source: source,
          });
        }
      } catch (error) {
        console.error(`Power Analysis - Error calculating FTP for activity ${activity.id}:`, error);
      }
    });

    console.debug(
      `Power Analysis - Generated ${this.activityFtpEstimates.length} FTP estimates from activities`
    );

    // Sort by date (newest first) in case processing changed the order
    this.activityFtpEstimates.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
