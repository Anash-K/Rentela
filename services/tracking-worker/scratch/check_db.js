import prisma from "../src/libs/prisma.js";

async function main() {
  const devices = await prisma.vehicleDevice.findMany();
  console.log("Devices:", devices);
  
  const logs = await prisma.telemetryLog.findMany({
    take: 5,
    orderBy: { recordedAt: 'desc' }
  });
  console.log("Latest Logs:", logs);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
