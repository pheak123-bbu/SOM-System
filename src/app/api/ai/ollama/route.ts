import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  const configuredModel = process.env.AI_MODEL || "qwen2.5:7b";
  const skipOllama = process.env.SKIP_OLLAMA === "true" || (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "ollama");

  if (skipOllama) {
    return NextResponse.json({
      online: false,
      baseUrl,
      configuredModel,
      models: [],
      activeProvider: "cambodia-social-ai",
      skipped: true,
      message: "កំពុងប្រើម៉ាស៊ីនវិភាគស្រាប់ Cambodia Social NLP Engine (លឿន រហ័ស និងមិនស៊ីទំហំ Disk 0MB)",
    });
  }

  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json({
        online: false,
        baseUrl,
        configuredModel,
        models: [],
        activeProvider: "cambodia-social-ai",
        message: `Ollama ឆ្លើយតបកំហុស HTTP ${res.status} (ប្រព័ន្ធកំពុងដំណើរការជាមួយម៉ាស៊ីនវិភាគ Cambodia Social NLP)`,
      });
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : [];
    const hasConfiguredModel = models.some((name: string) => name.startsWith(configuredModel));

    return NextResponse.json({
      online: true,
      baseUrl,
      configuredModel,
      models,
      hasConfiguredModel,
      activeProvider: hasConfiguredModel ? "ollama" : "cambodia-social-ai",
      message: hasConfiguredModel
        ? `Ollama សកម្ម និងបានរកឃើញម៉ូដែល ${configuredModel}!`
        : `Ollama សកម្មប៉ុន្តែមិនទាន់ទាញយក ${configuredModel} ទេ (កំពុងប្រើ Cambodia Social NLP)`,
    });
  } catch (err) {
    return NextResponse.json({
      online: false,
      baseUrl,
      configuredModel,
      models: [],
      activeProvider: "cambodia-social-ai",
      message: "Ollama មិនទាន់បើកដំណើរការទេ (ប្រព័ន្ធដំណើរការជាមួយ Cambodia Social Pattern Engine ដោយស្វ័យប្រវត្តិ)",
    });
  }
}
