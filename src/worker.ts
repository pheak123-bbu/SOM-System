import IORedis from "ioredis";
import { Worker } from "bullmq";
import { processDetectionJob } from "@/lib/ai/detection";
import { closeDetectionQueue, queueName } from "@/lib/ai/queue";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL must be configured to run the AI worker.");
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker<{ jobId: string }>(
  queueName,
  async (job) => processDetectionJob(job.data.jobId),
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 3) },
);

worker.on("failed", (job, error) => console.error("AI detection job failed", { jobId: job?.data.jobId, error: error.message }));
worker.on("error", (error) => console.error("AI worker error", error));
console.info("AI detection worker started.");

async function shutdown() {
  await worker.close();
  await closeDetectionQueue();
  await connection.quit();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
