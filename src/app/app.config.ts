import { HttpClientModule } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withDebugTracing } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { NgxChartsModule } from '@swimlane/ngx-charts';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { ActivityEffects } from './store/activity/activity.effects';
import { activityReducer } from './store/activity/activity.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withDebugTracing()),
    provideClientHydration(),
    provideAnimations(),
    provideStore({
      activities: activityReducer,
    }),
    provideEffects([ActivityEffects]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: environment.production,
    }),
    importProvidersFrom(NgxChartsModule, FormsModule, HttpClientModule),
  ],
};
