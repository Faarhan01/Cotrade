import { dbSaveKnowledgeTelemetryAggregate, dbGetKnowledgeTelemetryAggregate } from '../database/db.js';

export interface AiKnowledgeBase {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  timeOfDayPatterns: Record<string, { avgSpeed: number; sampleCount: number; dominantDirection: string }>;
  lastUpdated: string;
}

export interface KnowledgeUpdateResult {
  totalObservations: number;
  globalAverageSpeed: number;
  peakVelocityRegistered: number;
  updatedHours: string[];
}

let inMemoryKnowledge: AiKnowledgeBase = {
  totalObservations: 0,
  globalAverageSpeed: 0,
  peakVelocityRegistered: 0,
  timeOfDayPatterns: {},
  lastUpdated: new Date().toISOString(),
};

// Initialize knowledge from SQLite database on module load
(async () => {
  try {
    const saved = await dbGetKnowledgeTelemetryAggregate();
    if (saved && saved.totalObservations > 0) {
      inMemoryKnowledge = {
        totalObservations: saved.totalObservations,
        globalAverageSpeed: saved.globalAverageSpeed,
        peakVelocityRegistered: saved.peakVelocityRegistered,
        timeOfDayPatterns: saved.timeOfDayPatterns || {},
        lastUpdated: saved.updatedAt,
      };
    }
  } catch (err) {
    console.warn('[Knowledge] Failed to load persisted telemetry aggregate:', err);
  }
})();

export function getAiKnowledge(): AiKnowledgeBase {
  return inMemoryKnowledge;
}


export function updateKnowledgeBaseFromTelemetry(
  symbol: string,
  telemetry: Array<{ velocity: number; timestamp: number }>
): KnowledgeUpdateResult {
  if (!telemetry || telemetry.length === 0) {
    return {
      totalObservations: inMemoryKnowledge.totalObservations,
      globalAverageSpeed: inMemoryKnowledge.globalAverageSpeed,
      peakVelocityRegistered: inMemoryKnowledge.peakVelocityRegistered,
      updatedHours: [],
    };
  }

  const newObs = telemetry.length;
  const velocities = telemetry.map((t) => Math.abs(t.velocity));
  const avgSpeed = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const maxVel = Math.max(...velocities);

  const updatedHours: string[] = [];

  for (const item of telemetry) {
    const d = new Date(item.timestamp);
    const hourKey = String(d.getUTCHours()).padStart(2, '0');
    if (!inMemoryKnowledge.timeOfDayPatterns[hourKey]) {
      inMemoryKnowledge.timeOfDayPatterns[hourKey] = {
        avgSpeed: Math.abs(item.velocity),
        sampleCount: 1,
        dominantDirection: item.velocity >= 0 ? 'up' : 'down',
      };
    } else {
      const p = inMemoryKnowledge.timeOfDayPatterns[hourKey];
      p.avgSpeed = (p.avgSpeed * p.sampleCount + Math.abs(item.velocity)) / (p.sampleCount + 1);
      p.sampleCount++;
    }
    if (!updatedHours.includes(hourKey)) updatedHours.push(hourKey);
  }

  inMemoryKnowledge.totalObservations += newObs;
  inMemoryKnowledge.globalAverageSpeed = Number(
    ((inMemoryKnowledge.globalAverageSpeed * (inMemoryKnowledge.totalObservations - newObs) +
      avgSpeed * newObs) /
      inMemoryKnowledge.totalObservations).toFixed(2)
  );
  if (maxVel > inMemoryKnowledge.peakVelocityRegistered) {
    inMemoryKnowledge.peakVelocityRegistered = Number(maxVel.toFixed(2));
  }
  inMemoryKnowledge.lastUpdated = new Date().toISOString();

  // Persist to SQLite
  dbSaveKnowledgeTelemetryAggregate({
    totalObservations: inMemoryKnowledge.totalObservations,
    globalAverageSpeed: inMemoryKnowledge.globalAverageSpeed,
    peakVelocityRegistered: inMemoryKnowledge.peakVelocityRegistered,
    timeOfDayPatterns: inMemoryKnowledge.timeOfDayPatterns,
  }).catch((e) => console.warn('[Knowledge] Failed to persist telemetry aggregate:', e));

  return {
    totalObservations: inMemoryKnowledge.totalObservations,
    globalAverageSpeed: inMemoryKnowledge.globalAverageSpeed,
    peakVelocityRegistered: inMemoryKnowledge.peakVelocityRegistered,
    updatedHours,
  };
}

