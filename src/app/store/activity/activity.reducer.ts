import { EntityAdapter, EntityState, createEntityAdapter } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { FitActivity } from '../../services/fit-parser.service';
import * as ActivityActions from './activity.actions';

export interface ActivityState extends EntityState<FitActivity> {
  selectedActivityId: string | null;
  loaded: boolean;
  loading: boolean;
  error: any;
}

// Sort activities by date - newest first
export const adapter: EntityAdapter<FitActivity> = createEntityAdapter<FitActivity>({
  sortComparer: (a: FitActivity, b: FitActivity) => {
    // Use the dates for comparison (newest first)
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  },
});

export const initialState: ActivityState = adapter.getInitialState({
  selectedActivityId: null,
  loaded: false,
  loading: false,
  error: null,
});

export const activityReducer = createReducer(
  initialState,

  on(ActivityActions.loadActivities, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(ActivityActions.loadActivitiesSuccess, (state, { activities }) =>
    adapter.setAll(activities, {
      ...state,
      loading: false,
      loaded: true,
    })
  ),

  on(ActivityActions.loadActivitiesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(ActivityActions.addActivity, (state, { activity }) => adapter.addOne(activity, state)),

  on(ActivityActions.selectActivity, (state, { id }) => ({
    ...state,
    selectedActivityId: id,
  })),

  on(ActivityActions.removeActivity, (state, { id }) => adapter.removeOne(id, state)),

  on(ActivityActions.clearAllActivities, (state) =>
    adapter.removeAll({ ...state, selectedActivityId: null })
  )
);

// Export the selectors
export const { selectIds, selectEntities, selectAll, selectTotal } = adapter.getSelectors();
