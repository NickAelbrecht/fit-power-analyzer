import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
// @ts-ignore
import FitParser from 'fit-file-parser';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

export interface PowerData {
  timestamp: Date;
  power: number;
  heartRate?: number;
  cadence?: number;
  speed?: number;
  distance?: number;
}

export interface HeartRateData {
  timestamp: Date;
  heartRate: number;
}

export interface FitActivity {
  id: string;
  date: Date;
  name: string;
  type: string;
  totalTime: number;
  powerData: PowerData[];
  heartRateData?: HeartRateData[];
  avgPower: number;
  maxPower: number;
  normalizedPower?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FitParserService {
  private parser = new FitParser();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // Clear any sample data from localStorage on service initialization
    this.clearSampleData();
  }

  // Clear sample data from localStorage
  private clearSampleData(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const storedActivities = localStorage.getItem('fit-activities');
        if (storedActivities) {
          const activities = JSON.parse(storedActivities);
          // Filter out any activities with IDs that start with 'sample-'
          const realActivities = activities.filter(
            (activity: FitActivity) => !activity.id.startsWith('sample-')
          );

          // If we removed any sample activities, update localStorage
          if (realActivities.length !== activities.length) {
            localStorage.setItem('fit-activities', JSON.stringify(realActivities));
          }
        }
      } catch (error) {
        console.error('Error clearing sample data:', error);
      }
    }
  }

  parseFitFile(file: File): Observable<FitActivity> {
    return from(this.readFileAsArrayBuffer(file)).pipe(
      switchMap((buffer) => from(this.processFitData(buffer, file.name))),
      catchError((error) => {
        console.error('Error parsing FIT file:', error);
        return throwError(() => new Error(`Failed to parse FIT file: ${error.message}`));
      })
    );
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
      fileReader.onerror = reject;
      fileReader.readAsArrayBuffer(file);
    });
  }

  private processFitData(buffer: ArrayBuffer, fileName: string): Promise<FitActivity> {
    return new Promise((resolve, reject) => {
      this.parser.parse(buffer, (error: any, data: any) => {
        if (error) {
          reject(error);
          return;
        }

        // Extract power data
        const powerData: PowerData[] = [];
        const heartRateData: HeartRateData[] = [];
        let maxPower = 0;
        let totalPower = 0;
        let powerPoints = 0;

        // Parse sessions and records
        if (data.records) {
          data.records.forEach((record: any) => {
            if (record.power) {
              // Extract power data and other metrics
              const point: PowerData = {
                timestamp: new Date(record.timestamp),
                power: record.power,
                heartRate: record.heart_rate,
                cadence: record.cadence,
                speed: record.speed,
                distance: record.distance,
              };

              powerData.push(point);

              // Track max and sum for average
              if (record.power > maxPower) {
                maxPower = record.power;
              }
              totalPower += record.power;
              powerPoints++;
            }

            // Also collect heart rate data in a separate array
            if (record.heart_rate) {
              heartRateData.push({
                timestamp: new Date(record.timestamp),
                heartRate: record.heart_rate,
              });
            }
          });
        }

        // Create activity object
        const activity: FitActivity = {
          id: new Date().getTime().toString(),
          date: data.sessions?.[0]?.start_time || new Date(),
          name: fileName || 'Unknown Activity',
          type: data.sessions?.[0]?.sport || 'cycling',
          totalTime: data.sessions?.[0]?.total_timer_time || 0,
          powerData: powerData,
          heartRateData: heartRateData.length > 0 ? heartRateData : undefined,
          avgPower: powerPoints > 0 ? Math.round(totalPower / powerPoints) : 0,
          maxPower: maxPower,
        };

        resolve(activity);
      });
    });
  }
}
