// Web Worker for parsing FIT files using fit-file-parser
// This worker expects messages of the form: { id: string, buffer: ArrayBuffer }
// It responds with: { id, activity } or { id, error }

import FitParser from 'fit-file-parser';

declare const self: DedicatedWorkerGlobalScope & typeof globalThis;

const parser = new FitParser();

self.addEventListener('message', (ev: MessageEvent) => {
  const data = ev.data || {};
  const id = data.id;
  const buffer: ArrayBuffer = data.buffer;

  if (!buffer) {
    self.postMessage({ id, error: 'No buffer provided' });
    return;
  }

  try {
    // parse may be synchronous or asynchronous via callback depending on library
    parser.parse(buffer, (error: any, parsed: any) => {
      if (error) {
        self.postMessage({ id, error: error.message || String(error) });
        return;
      }

      // Build a lightweight activity object similar to service expectations
      const powerData: any[] = [];
      const heartRateData: any[] = [];
      let maxPower = 0;
      let totalPower = 0;
      let powerPoints = 0;

      if (parsed.records) {
        parsed.records.forEach((record: any) => {
          if (record.power) {
            const point = {
              timestamp: new Date(record.timestamp),
              power: record.power,
              heartRate: record.heart_rate,
              cadence: record.cadence,
              speed: record.speed,
              distance: record.distance,
            };
            powerData.push(point);
            if (record.power > maxPower) maxPower = record.power;
            totalPower += record.power;
            powerPoints++;
          }

          if (record.heart_rate) {
            heartRateData.push({ timestamp: new Date(record.timestamp), heartRate: record.heart_rate });
          }
        });
      }

      const activity = {
        id: String(Date.now()),
        date: parsed.sessions?.[0]?.start_time || new Date(),
        name: parsed.name || 'Unknown Activity',
        type: parsed.sessions?.[0]?.sport || 'cycling',
        totalTime: parsed.sessions?.[0]?.total_timer_time || 0,
        powerData,
        heartRateData: heartRateData.length ? heartRateData : undefined,
        avgPower: powerPoints > 0 ? Math.round(totalPower / powerPoints) : 0,
        maxPower,
      };

      // Post the activity back
      self.postMessage({ id, activity });
    });
  } catch (err: any) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
});
