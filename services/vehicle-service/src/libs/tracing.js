// services/vehicle-service/src/lib/tracing.js

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const traceExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  serviceName: "vehicle-service",
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
    }),
  ],
});

// -----------------------------------------------------
// Start Tracing
// -----------------------------------------------------
export const startTracing = async () => {
  await sdk.start();

  console.log("SigNoz tracing started (vehicle-service)");
};

// -----------------------------------------------------
// Graceful Shutdown
// -----------------------------------------------------
process.on("SIGTERM", async () => {
  await sdk.shutdown();
});

process.on("SIGINT", async () => {
  await sdk.shutdown();
});
