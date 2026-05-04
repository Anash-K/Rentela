const baseLat = 12.9716;
const baseLng = 77.5946;

const random = (min, max) => Math.random() * (max - min) + min;

export const mockProvider = {
  // Live latest data
  async getLatest(vehicleId) {
    return {
      vehicleId,

      latitude: baseLat + random(-0.01, 0.01),

      longitude: baseLng + random(-0.01, 0.01),

      speedKm: Math.floor(random(0, 80)),

      batteryPercent: Math.floor(random(25, 100)),

      charging: Math.random() > 0.8,

      isOnline: Math.random() > 0.05,

      odoMeterKm: Math.floor(random(1000, 20000)),

      timestamp: new Date(),
    };
  },

  // History demo
  async getHistory(vehicleId) {
    const items = [];

    for (let i = 0; i < 10; i++) {
      items.push({
        vehicleId,
        latitude: baseLat + random(-0.02, 0.02),
        longitude: baseLng + random(-0.02, 0.02),
        speedKm: Math.floor(random(0, 60)),
        recordedAt: new Date(Date.now() - i * 60000),
      });
    }

    return items;
  },
};
