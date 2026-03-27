import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

// Worker-based parsing: the worker will import the third-party parser.
// The service sends an ArrayBuffer with transfer to avoid copies.

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
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // Clear any sample data from localStorage on service initialization
    this.clearSampleData();
  }

  private createWorker(): Worker {
    // Use module worker import so bundler includes the worker file
    // Path is relative to this service file
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new Worker(new URL('../workers/fit-parser.worker', import.meta.url), { type: 'module' });
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
    // Read file then send buffer to worker with transfer for zero-copy
    return new Observable<FitActivity>((subscriber) => {
      this.readFileAsArrayBuffer(file)
        .then((buffer) => {
          if (!isPlatformBrowser(this.platformId)) {
            subscriber.error(new Error('Parsing only supported in browser environment'));
            return;
          }

          const worker = this.createWorker();
          const msgId = String(Date.now()) + Math.random().toString(16).slice(2);

          const onMessage = (ev: MessageEvent) => {
            const data = ev.data || {};
            if (data.id !== msgId) return;
            if (data.error) {
              subscriber.error(new Error(data.error));
            } else {
              subscriber.next(data.activity as FitActivity);
              subscriber.complete();
            }
            worker.removeEventListener('message', onMessage);
            worker.terminate();
          };

          const onError = (ev: ErrorEvent) => {
            subscriber.error(new Error(ev.message || 'Worker error'));
            worker.removeEventListener('error', onError);
            worker.terminate();
          };

          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', onError);

          // Transfer the buffer to the worker to avoid copy
          worker.postMessage({ id: msgId, buffer }, [buffer]);

          // Teardown: terminate worker if unsubscribed
          return () => {
            try {
              worker.terminate();
            } catch (e) {
              // ignore
            }
          };
        })
        .catch((err) => subscriber.error(err));
    }).pipe(
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
}
