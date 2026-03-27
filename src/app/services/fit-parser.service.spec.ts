import { TestBed } from '@angular/core/testing';
import { FitParserService } from './fit-parser.service';
import { PLATFORM_ID } from '@angular/core';

describe('FitParserService (worker integration)', () => {
  let service: FitParserService;
  const originalWorker = (window as any).Worker;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(FitParserService);
  });

  afterEach(() => {
    // Restore global Worker
    (window as any).Worker = originalWorker;
  });

  it('parses a buffer via the worker and returns an activity', (done) => {
    // Mock Worker to simulate parsing
    class MockWorker {
      private listeners: Record<string, Function[]> = {};
      constructor(_script: string, _opts?: any) {}
      postMessage(msg: any, _transfer?: any) {
        const id = msg.id;
        // simulate async response
        setTimeout(() => {
          const activity = {
            id: 'mock-1',
            date: new Date(),
            name: 'mock.fit',
            type: 'cycling',
            totalTime: 1000,
            powerData: [{ timestamp: new Date(), power: 150 }],
            avgPower: 150,
            maxPower: 150,
          };
          this.listeners['message']?.forEach((fn) => fn({ data: { id, activity } }));
        }, 10);
      }
      addEventListener(name: string, fn: Function) {
        this.listeners[name] = this.listeners[name] || [];
        this.listeners[name].push(fn);
      }
      removeEventListener(_name: string, _fn: Function) {}
      terminate() {}
    }

    (window as any).Worker = MockWorker;

    const buffer = new ArrayBuffer(8);
    // Spy on private read to avoid FileReader complexity
    (service as any).readFileAsArrayBuffer = () => Promise.resolve(buffer);

    const file = new File([buffer], 'test.fit', { type: 'application/octet-stream' });

    const sub = service.parseFitFile(file).subscribe({
      next: (activity) => {
        expect(activity).toBeDefined();
        expect((activity as any).name).toBe('mock.fit');
        sub.unsubscribe();
        done();
      },
      error: (err) => done.fail(err),
    });
  });

  it('errors when worker reports an error', (done) => {
    class ErrorWorker {
      private listeners: Record<string, Function[]> = {};
      constructor() {}
      postMessage(msg: any) {
        const id = msg.id;
        setTimeout(() => {
          this.listeners['message']?.forEach((fn) => fn({ data: { id, error: 'parse failed' } }));
        }, 10);
      }
      addEventListener(name: string, fn: Function) {
        this.listeners[name] = this.listeners[name] || [];
        this.listeners[name].push(fn);
      }
      removeEventListener(_name: string, _fn: Function) {}
      terminate() {}
    }

    (window as any).Worker = ErrorWorker;

    const buffer = new ArrayBuffer(4);
    (service as any).readFileAsArrayBuffer = () => Promise.resolve(buffer);
    const file = new File([buffer], 'bad.fit');

    service.parseFitFile(file).subscribe({
      next: () => done.fail('should not succeed'),
      error: (err) => {
        expect(err).toBeTruthy();
        done();
      },
    });
  });
});
