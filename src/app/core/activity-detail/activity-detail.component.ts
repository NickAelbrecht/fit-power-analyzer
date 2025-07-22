import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, HostListener, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { Color, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import * as shape from 'd3-shape';
import { Observable, of } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { FitActivity } from '../../services/fit-parser.service';
import * as fromActivityReducer from '../../store/activity/activity.reducer';

interface ZoneDistribution {
  name: string;
  label: string;
  percentage: number;
}

@Component({
  selector: 'app-activity-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, NgxChartsModule],
  templateUrl: './activity-detail.component.html',
  styleUrls: ['./activity-detail.component.scss'],
})
export class ActivityDetailComponent implements OnInit, OnDestroy {
  activity$: Observable<FitActivity | undefined>;
  chartData$: Observable<any[]>;
  activityId: string | null = null;

  // Power zones (FTP percentages)
  powerZones = [
    { name: 'zone1', min: 0, max: 55 }, // Active Recovery
    { name: 'zone2', min: 56, max: 75 }, // Endurance
    { name: 'zone3', min: 76, max: 90 }, // Tempo
    { name: 'zone4', min: 91, max: 105 }, // Threshold
    { name: 'zone5', min: 106, max: 120 }, // VO2 Max
    { name: 'zone6', min: 121, max: 150 }, // Anaerobic
    { name: 'zone7', min: 151, max: 999 }, // Neuromuscular
  ];

  // Chart properties
  colorScheme: Color = {
    name: 'powerHeartRate',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#ff4081', '#2196f3'], // Bright pink for heart rate, Blue for power
  };

  // Using a simpler curve value that's directly supported
  curve = shape.curveMonotoneX; // Use d3 curve function instead of string

  gradient = true;
  showXAxis = true;
  showYAxis = true;
  showLegend = true;
  showXAxisLabel = true;
  showYAxisLabel = true;
  xAxisLabel = 'Time';
  yAxisLabel = 'Power (W) / Heart Rate (bpm)';
  timeline = true;

  // User FTP settings (can be made configurable in the future)
  userFTP = 250;

  // Chart dimensions with default values
  chartDimensions: [number, number] = [1000, 400];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store<{ activities: fromActivityReducer.ActivityState }>,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.userFTP = localStorage.getItem('user-ftp')
        ? Number(localStorage.getItem('user-ftp'))
        : 250;
    }
    this.activity$ = this.route.paramMap.pipe(
      map((params) => params.get('id')),
      tap((id) => (this.activityId = id)),
      switchMap((id) => {
        if (!id) {
          return of(undefined);
        }
        return this.store.pipe(
          select((state) => state.activities),
          select(fromActivityReducer.selectEntities),
          map((entities) => entities[id])
        );
      }),
      tap((activity) => {
        if (!activity) {
          console.error('Activity not found');
        }
      })
    );

    // Transform activity data for chart
    this.chartData$ = this.activity$.pipe(
      map((activity) => {
        if (!activity || !activity.powerData || activity.powerData.length === 0) {
          return [];
        }

        const hasHeartRate = activity.powerData.some((point) => point.heartRate);
        const chartData = [];

        // Add power data
        const powerSeries = this.optimizeChartData(
          activity.powerData.map((point) => ({
            name: new Date(point.timestamp),
            value: point.power || 0, // Add fallback for null/undefined
          }))
        );

        if (powerSeries.length > 0) {
          chartData.push({
            name: 'Power',
            series: powerSeries,
          });
        }

        // Add heart rate data if available
        if (hasHeartRate) {
          const hrSeries = this.optimizeChartData(
            activity.powerData
              .filter((point) => point.heartRate !== undefined && point.heartRate !== null)
              .map((point) => ({
                name: new Date(point.timestamp),
                value: point.heartRate || 0, // Add fallback for null/undefined
              }))
          );

          if (hrSeries.length > 0) {
            chartData.push({
              name: 'Heart Rate',
              series: hrSeries,
            });
          }
        }

        return chartData;
      })
    );
  }

  ngOnInit(): void {
    // Initialize chart dimensions
    this.updateChartDimensions();
  }

  ngOnDestroy(): void {
    // Cleanup code if needed
  }

  // Optimize chart data for performance
  optimizeChartData(data: any[]): any[] {
    if (!data || data.length === 0) return [];

    // Sort data by timestamp to ensure proper rendering
    data.sort((a, b) => a.name.getTime() - b.name.getTime());

    // If reasonable amount of data, return as is
    if (data.length <= 500) return data;

    // For larger datasets, sample at a higher rate for better performance
    const sampleRate = Math.ceil(data.length / 500);
    return data.filter((_, i) => i % sampleRate === 0);
  }

  // Helper methods for displaying activity data
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

  getPowerZoneClass(power: number): string {
    // Calculate power as percentage of FTP
    const powerPercentage = (power / this.userFTP) * 100;

    // Find the zone
    for (const zone of this.powerZones) {
      if (powerPercentage >= zone.min && powerPercentage <= zone.max) {
        return zone.name;
      }
    }

    return '';
  }

  getPowerZoneLabel(zoneName: string): string {
    switch (zoneName) {
      case 'zone1':
        return 'Active Recovery';
      case 'zone2':
        return 'Endurance';
      case 'zone3':
        return 'Tempo';
      case 'zone4':
        return 'Threshold';
      case 'zone5':
        return 'VO2 Max';
      case 'zone6':
        return 'Anaerobic';
      case 'zone7':
        return 'Neuromuscular';
      default:
        return zoneName;
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

  // Calculate Intensity Factor (IF)
  calculateIF(activity: FitActivity): number {
    const np = activity.normalizedPower || this.calculateNP(activity);
    return np / this.userFTP;
  }

  // Calculate Training Stress Score (TSS)
  calculateTSS(activity: FitActivity): number {
    const IF = this.calculateIF(activity);
    const durationHours = activity.totalTime / 3600;
    return 100 * IF * IF * durationHours;
  }

  // Calculate Variability Index (VI)
  calculateVI(activity: FitActivity): number {
    const np = activity.normalizedPower || this.calculateNP(activity);
    return np / activity.avgPower;
  }

  // Calculate Work in kilojoules
  calculateWork(activity: FitActivity): number {
    if (!activity.powerData || activity.powerData.length === 0) {
      return 0;
    }

    // Each watt for 1 second is 1 joule
    // Sum up all power readings and convert to kilojoules
    return Math.round(activity.powerData.reduce((sum, point) => sum + point.power, 0) / 1000);
  }

  // Calculate time spent in each power zone
  getZoneDistribution(activity: FitActivity): ZoneDistribution[] {
    if (!activity.powerData || activity.powerData.length === 0) {
      return [];
    }

    // Count points in each zone
    const zoneCounts = this.powerZones.map((zone) => ({
      name: zone.name,
      label: this.getPowerZoneLabel(zone.name),
      count: 0,
    }));

    activity.powerData.forEach((point) => {
      const zone = this.getPowerZoneClass(point.power);
      const zoneObj = zoneCounts.find((z) => z.name === zone);
      if (zoneObj) {
        zoneObj.count++;
      }
    });

    // Convert to percentages
    const totalPoints = activity.powerData.length;
    return zoneCounts.map((zone) => ({
      name: zone.name,
      label: zone.label,
      percentage: (zone.count / totalPoints) * 100,
    }));
  }

  // Calculate training impact for different energy systems
  getEnduranceImpact(activity: FitActivity): number {
    const zoneDistribution = this.getZoneDistribution(activity);
    const enduranceZones = ['zone1', 'zone2', 'zone3'];
    const enduranceTime = zoneDistribution
      .filter((zone) => enduranceZones.includes(zone.name))
      .reduce((sum, zone) => sum + zone.percentage, 0);

    const tss = this.calculateTSS(activity);

    // Scale impact based on TSS and time in endurance zones
    return (enduranceTime / 100) * (tss / 100) * 5;
  }

  getThresholdImpact(activity: FitActivity): number {
    const zoneDistribution = this.getZoneDistribution(activity);
    const thresholdZone = zoneDistribution.find((zone) => zone.name === 'zone4');
    const thresholdTime = thresholdZone ? thresholdZone.percentage : 0;

    const tss = this.calculateTSS(activity);

    // Threshold training is most effective when focused
    return (thresholdTime / 100) * (tss / 50) * 5;
  }

  getVO2MaxImpact(activity: FitActivity): number {
    const zoneDistribution = this.getZoneDistribution(activity);
    const vo2Zone = zoneDistribution.find((zone) => zone.name === 'zone5');
    const vo2Time = vo2Zone ? vo2Zone.percentage : 0;

    const tss = this.calculateTSS(activity);

    // VO2 Max training has high impact even with less time
    return (vo2Time / 100) * (tss / 30) * 5;
  }

  getAnaerobicImpact(activity: FitActivity): number {
    const zoneDistribution = this.getZoneDistribution(activity);
    const anaerobicZones = ['zone6', 'zone7'];
    const anaerobicTime = zoneDistribution
      .filter((zone) => anaerobicZones.includes(zone.name))
      .reduce((sum, zone) => sum + zone.percentage, 0);

    const tss = this.calculateTSS(activity);

    // Anaerobic training has very high impact with minimal time
    return (anaerobicTime / 100) * (tss / 20) * 5;
  }

  // Get impact level for styling
  getImpactLevel(impact: number): string {
    if (impact < 1) return 'impact-low';
    if (impact < 2) return 'impact-medium-low';
    if (impact < 3) return 'impact-medium';
    if (impact < 4) return 'impact-medium-high';
    return 'impact-high';
  }

  // Get text description of impact
  getImpactText(impact: number): string {
    if (impact < 1) return 'Low';
    if (impact < 2) return 'Medium-Low';
    if (impact < 3) return 'Medium';
    if (impact < 4) return 'Medium-High';
    return 'High';
  }

  goBack(): void {
    this.router.navigate(['/activities']);
  }

  @HostListener('window:resize')
  onResize() {
    this.updateChartDimensions();
  }

  updateChartDimensions() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      // Set default dimensions for server-side rendering
      this.chartDimensions = [1000, 400];
      return;
    }

    // Set chart dimensions to reasonable defaults that work well in most containers
    // while still allowing the chart to be responsive
    this.chartDimensions = [window.innerWidth > 1200 ? 1000 : window.innerWidth * 0.8, 400];
  }
}
