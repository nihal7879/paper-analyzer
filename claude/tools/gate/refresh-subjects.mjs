// Dev only: similar-question refresh for chosen subject ids (the CLI does every subject). Usage: node refresh-subjects.mjs 6 19
import { NestFactory } from "@nestjs/core";
const { AppModule } = await import("file:///D:/paper analyzer/api/dist/app.module.js");
const { SimilarityService } = await import("file:///D:/paper analyzer/api/dist/similarity/similarity.service.js");
const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
try { for (const id of process.argv.slice(2)) console.log("subject", id, JSON.stringify(await app.get(SimilarityService).refreshSubject(+id))); }
finally { await app.close(); }
