import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  timeout?: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  constructor() {}

  addNotification(
    message: string,
    type: 'info' | 'warning' | 'error' = 'info',
    timeout = 5000
  ): void {
    const id = Date.now().toString();
    const notification: Notification = { id, message, type, timeout };

    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, notification]);

    if (timeout > 0) {
      setTimeout(() => this.removeNotification(id), timeout);
    }
  }

  removeNotification(id: string): void {
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next(currentNotifications.filter((n) => n.id !== id));
  }
}
