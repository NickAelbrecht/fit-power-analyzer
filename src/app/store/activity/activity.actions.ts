import { createAction, props } from '@ngrx/store';
import { FitActivity } from '../../services/fit-parser.service';

export const loadActivities = createAction('[Activity] Load Activities');
export const loadActivitiesSuccess = createAction(
  '[Activity] Load Activities Success',
  props<{ activities: FitActivity[] }>()
);
export const loadActivitiesFailure = createAction(
  '[Activity] Load Activities Failure',
  props<{ error: any }>()
);

export const addActivity = createAction(
  '[Activity] Add Activity',
  props<{ activity: FitActivity }>()
);

export const selectActivity = createAction('[Activity] Select Activity', props<{ id: string }>());

export const clearAllActivities = createAction('[Activity] Clear All Activities');

export const removeActivity = createAction('[Activity] Remove Activity', props<{ id: string }>());
