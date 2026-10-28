import { Queue } from "bullmq";
import IORedis from "ioredis";

const queueName = "order-detection";
let redis: IORedis | undefined;
let queue: Queue | undefined;

function getQueue() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("ត្រូវកំណត់ REDIS_URL ដើម្បីដាក់ការងាររកឃើញ AI ក្នុងជួររង់ចាំ។");
  redis ??= new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  queue ??= new Queue(queueName, { connection: redis });
  return queue;
}

export async function enqueueDetection(jobId: string, queueId = jobId) {
  await getQueue().add("analyze-conversation", { jobId }, {
    jobId: queueId,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 604_800, count: 1000 },
  });
}

export async function closeDetectionQueue() {
  await queue?.close();
  await redis?.quit();
  queue = undefined;
  redis = undefined;
}

export { queueName };
