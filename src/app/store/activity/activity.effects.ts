import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { FitActivity } from '../../services/fit-parser.service';
import * as ActivityActions from './activity.actions';

@Injectable()
export class ActivityEffects {
  loadActivities$;
  saveActivities$;

  constructor(
    private actions$: Actions,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Initialize effects in constructor
    this.loadActivities$ = createEffect(() =>
      this.actions$.pipe(
        ofType(ActivityActions.loadActivities),
        switchMap(() => {
          // Check if we're in a browser environment before accessing localStorage
          let activities: FitActivity[] = [];

          if (isPlatformBrowser(this.platformId)) {
            const storedActivities = localStorage.getItem('fit-activities');
            activities = storedActivities ? JSON.parse(storedActivities) : [];
          }

          return of(ActivityActions.loadActivitiesSuccess({ activities })).pipe(
            catchError((error) => of(ActivityActions.loadActivitiesFailure({ error })))
          );
        })
      )
    );

    // Save activities to localStorage when they change
    this.saveActivities$ = createEffect(
      () =>
        this.actions$.pipe(
          ofType(
            ActivityActions.addActivity,
            ActivityActions.loadActivitiesSuccess,
            ActivityActions.removeActivity,
            ActivityActions.clearAllActivities
          ),
          tap((action) => {
            if (isPlatformBrowser(this.platformId)) {
              try {
                if (action.type === ActivityActions.addActivity.type) {
                  // Use a more efficient storage approach - store only essential data
                  const storedActivitiesString = localStorage.getItem('fit-activities') || '[]';
                  let storedActivities: FitActivity[] = JSON.parse(storedActivitiesString);

                  // Add the new activity but reduce the data size by trimming the power data
                  const trimmedActivity = this.trimActivityForStorage(action.activity);
                  storedActivities.push(trimmedActivity);

                  // Try to save the activities
                  this.safelyStoreActivities(storedActivities);
                } else if (action.type === ActivityActions.removeActivity.type) {
                  const storedActivitiesString = localStorage.getItem('fit-activities') || '[]';
                  let storedActivities: FitActivity[] = JSON.parse(storedActivitiesString);
                  storedActivities = storedActivities.filter((a) => a.id !== action.id);
                  localStorage.setItem('fit-activities', JSON.stringify(storedActivities));
                } else if (action.type === ActivityActions.clearAllActivities.type) {
                  localStorage.setItem('fit-activities', '[]');
                }
              } catch (error) {
                console.error('Error storing activities in localStorage:', error);
                // If it's a quota error, show a notification or handle gracefully
                if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                  console.warn(
                    'Storage quota exceeded. Some activity data may not be saved locally.'
                  );
                  // You could dispatch an action here to show a user notification
                }
              }
            }
          })
        ),
      { dispatch: false }
    );
  }

  // Helper method to reduce the size of activity data for storage
  private trimActivityForStorage(activity: FitActivity): FitActivity {
    // Create a copy to avoid modifying the original
    const trimmedActivity = { ...activity };

    // Reduce the size of power data by sampling - keep only 1 point per 5 seconds
    // or limit total points to a reasonable number (e.g., 1000 points)
    if (trimmedActivity.powerData && trimmedActivity.powerData.length > 1000) {
      const samplingRate = Math.ceil(trimmedActivity.powerData.length / 1000);
      trimmedActivity.powerData = trimmedActivity.powerData.filter(
        (_, index) => index % samplingRate === 0
      );
    }

    return trimmedActivity;
  }

  // Helper method to safely store activities with fallback
  private safelyStoreActivities(activities: FitActivity[]): void {
    try {
      localStorage.setItem('fit-activities', JSON.stringify(activities));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, trying with reduced data...');

        // If we can't store all activities, try storing fewer or with less detail
        if (activities.length > 10) {
          // Keep only the 10 most recent activities
          const recentActivities = activities.slice(-10);
          this.safelyStoreActivities(recentActivities);
        } else {
          // If we still have quota issues with 10 activities, drastically reduce the power data
          const highlyTrimmedActivities = activities.map((activity) => {
            const trimmed = { ...activity };

            // Keep only basic data, remove or severely limit power data
            if (trimmed.powerData) {
              // Keep just 100 power points max
              const samplingRate = Math.ceil(trimmed.powerData.length / 100);
              trimmed.powerData = trimmed.powerData.filter(
                (_, index) => index % samplingRate === 0
              );
            }

            return trimmed;
          });

          try {
            localStorage.setItem('fit-activities', JSON.stringify(highlyTrimmedActivities));
          } catch (finalError) {
            // If all else fails, just clear everything and inform the user
            console.error('Unable to store activities in localStorage even with reduced data');
            localStorage.removeItem('fit-activities');
          }
        }
      }
    }
  }
}
