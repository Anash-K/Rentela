import axios from "axios";
import { producer } from "../libs/kafka.js";

export async function syncAllVehicles() {
  console.log("Running sync...");

  const baseUrl = process.env.VEHICLE_SERVICE_URL || "http://localhost:5010";

  // 1. Get vehicles
  const res = await axios.get(`${baseUrl}/`);

  const vehicles = res.data?.data?.items || [];

  // 2. Emit event for each vehicle
  for (const vehicle of vehicles) {
    await producer.send({
      topic: "vehicle.telemetry",
      messages: [
        {
          key: vehicle.id,
          value: JSON.stringify({
            vehicleId: vehicle.id,
            triggeredAt: new Date(),
          }),
        },
      ],
    });
  }

  console.log(`Published ${vehicles.length} telemetry jobs`);
}
