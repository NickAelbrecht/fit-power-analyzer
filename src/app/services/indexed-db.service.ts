import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { FitActivity } from './fit-parser.service';

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private dbName = 'fit-power-analyzer';
  private dbVersion = 1;
  private activitiesStore = 'activities';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initDb();
  }

  private initDb(): Promise<IDBDatabase> {
    if (this.db) {
      return Promise.resolve(this.db);
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        console.error('Error opening IndexedDB', event);
        reject('Error opening IndexedDB');
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.activitiesStore)) {
          db.createObjectStore(this.activitiesStore, { keyPath: 'id' });
        }
      };
    });
  }

  saveActivity(activity: FitActivity): Observable<void> {
    return from(
      this.initDb().then((db) => {
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([this.activitiesStore], 'readwrite');
          const store = transaction.objectStore(this.activitiesStore);
          const request = store.put(activity);

          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event);
        });
      })
    );
  }

  getAllActivities(): Observable<FitActivity[]> {
    return from(
      this.initDb().then((db) => {
        return new Promise<FitActivity[]>((resolve, reject) => {
          const transaction = db.transaction([this.activitiesStore], 'readonly');
          const store = transaction.objectStore(this.activitiesStore);
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result);
          request.onerror = (event) => reject(event);
        });
      })
    );
  }

  deleteActivity(id: string): Observable<void> {
    return from(
      this.initDb().then((db) => {
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([this.activitiesStore], 'readwrite');
          const store = transaction.objectStore(this.activitiesStore);
          const request = store.delete(id);

          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event);
        });
      })
    );
  }

  clearAllActivities(): Observable<void> {
    return from(
      this.initDb().then((db) => {
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([this.activitiesStore], 'readwrite');
          const store = transaction.objectStore(this.activitiesStore);
          const request = store.clear();

          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event);
        });
      })
    );
  }
}
