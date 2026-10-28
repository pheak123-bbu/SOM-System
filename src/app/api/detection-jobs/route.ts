import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { enqueueDetection } from "@/lib/ai/queue";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const retrySchema = z.object({ jobId: z.string().min(1) });

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  try {
    const jobs = await db.detectionJob.findMany({
      where: { storeId: context.storeId, status: "FAILED" },
      include: { conversation: { include: { customer: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ jobs: jobs.map((job) => ({
      id: job.id,
      failure: job.failure,
      attempts: job.attempts,
      createdAt: job.createdAt,
      customer: job.conversation.customer?.name ?? "មិនទាន់ភ្ជាប់អតិថិជន",
      channel: job.conversation.channel,
    })) });
  } catch (error) {
    console.error("Failed detection job list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកការងាររកឃើញដែលបរាជ័យបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ត្រូវការលេខសម្គាល់ការងាររកឃើញ។" }, { status: 400 });
  try {
    const job = await db.detectionJob.findFirst({ where: { id: parsed.data.jobId, storeId: context.storeId } });
    if (!job) return NextResponse.json({ error: "រកមិនឃើញការងាររកឃើញទេ។" }, { status: 404 });
    if (job.status !== "FAILED") return NextResponse.json({ error: "អាចសាកល្បងម្ដងទៀតបានតែការងារដែលបរាជ័យប៉ុណ្ណោះ។" }, { status: 409 });
    const queueId = `${job.id}-retry-${randomUUID()}`;
    const updated = await db.detectionJob.updateMany({
      where: { id: job.id, storeId: context.storeId, status: "FAILED" },
      data: { status: "QUEUED", failure: null },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "ការងាររកឃើញនេះត្រូវបានសាកល្បងម្ដងទៀតរួចហើយ។" }, { status: 409 });
    try {
      await enqueueDetection(job.id, queueId);
    } catch (queueError) {
      const reason = queueError instanceof Error ? queueError.message : "ជួររង់ចាំការរកឃើញមិនអាចប្រើបានទេ។";
      await db.detectionJob.updateMany({
        where: { id: job.id, storeId: context.storeId, status: "QUEUED" },
        data: { status: "FAILED", failure: reason },
      });
      return NextResponse.json({ error: "មិនអាចដាក់ការសាកល្បងម្ដងទៀតក្នុងជួររង់ចាំបានទេ។ ការងារនៅតែបរាជ័យ ហើយអាចសាកល្បងម្ដងទៀតនៅពេលក្រោយ។" }, { status: 503 });
    }
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    console.error("Detection job retry failed:", error);
    return NextResponse.json({ error: "មិនអាចសាកល្បងការងាររកឃើញម្ដងទៀតបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "ត្រូវការលេខសម្គាល់ការងារ។" }, { status: 400 });

  try {
    await db.detectionJob.deleteMany({
      where: { id: jobId, storeId: context.storeId },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete detection job failed:", err);
    return NextResponse.json({ error: "មិនអាចជម្រះការងារបានទេ។" }, { status: 500 });
  }
}
