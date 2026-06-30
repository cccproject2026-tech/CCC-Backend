import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReviewCenterCacheService } from './review-center-cache.service';

/**
 * Global so the cache can be injected into mutation services
 * (roadmaps, assessment) for invalidation without creating circular
 * module dependencies with the MentorModule.
 */
@Global()
@Module({
    imports: [ConfigModule],
    providers: [ReviewCenterCacheService],
    exports: [ReviewCenterCacheService],
})
export class ReviewCenterCacheModule {}
