import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ProgressService } from '../modules/progress/progress.service';

async function main() {
    const logger = new Logger('BackfillAssessmentProgress');
    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    try {
        const progressService = app.get(ProgressService);
        const result = await progressService.reconcileAllProgressDocuments();
        logger.log(
            `Scanned ${result.scanned} progress document(s); updated ${result.updated}; ` +
            `removed ${result.orphansRemoved} orphan assessment row(s); ` +
            `synced ${result.assessmentsSynced} assessment row(s) from answers/templates.`,
        );
    } finally {
        await app.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
