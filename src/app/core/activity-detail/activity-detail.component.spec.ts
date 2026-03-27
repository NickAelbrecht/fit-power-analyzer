import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { Store } from '@ngrx/store';

import { ActivityDetailComponent } from './activity-detail.component';

describe('ActivityDetailComponent', () => {
  let component: ActivityDetailComponent;
  let fixture: ComponentFixture<ActivityDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityDetailComponent, RouterTestingModule],
      providers: [
        { provide: Store, useValue: { pipe: () => of({}), dispatch: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
